import Memory from './memory.js';
import SyscallHandler from './syscall.js';

export function spawn(source, custom_imports) {
  const memory = new Memory();
  const syscall_handler = new SyscallHandler(memory);
  let imports = {
    memory: memory.memory,
    __indirect_function_table: new WebAssembly.Table({initial: 1, maximum: 1, element: 'anyfunc'}),
    __syscall: function(nr, arg_ptr) { return syscall_handler.memarg_syscall(nr, arg_ptr); },
    __syscall0: function(nr) { return syscall_handler.syscall(nr); },
    __syscall1: function(nr, a1) { return syscall_handler.syscall(nr, a1); },
    __syscall2: function(nr, a1, a2) { return syscall_handler.syscall(nr, a1, a2); },
    __syscall3: function(nr, a1, a2, a3) { return syscall_handler.syscall(nr, a1, a2, a3); },
    __syscall4: function(nr, a1, a2, a3, a4) { return syscall_handler.syscall(nr, a1, a4, a3, a4); },
    __syscall5: function(nr, a1, a2, a3, a4, a5) { return syscall_handler.syscall(nr, a1, a2, a3, a4, a5); },
    __syscall6: function(nr, a1, a2, a3, a4, a5, a6) { return syscall_handler.syscall(nr, a1, a2, a3, a4, a5, a6); },
    setjmp: function(jmp_buf_ptr) { console.debug("setjmp"); return 0; },
    longjmp: function(jmp_buf_ptr, retval) { console.debug("longjmp"); }
  };

  custom_imports = custom_imports || {};
  for (let key in custom_imports) {
    imports[key] = custom_imports[key];
  }

  return WebAssembly.compileStreaming(source).then(function(wasm_module) {
    const error_handler = function(err) {
      // table entry has too small size
      let matches = err.message.match(/table import \d+ is smaller than initial (\d+)/);

      if (matches === null) { throw err; }

      let imported_table_size = matches[1];
      imports['__indirect_function_table'] = new WebAssembly.Table({initial: imported_table_size, maximum: imported_table_size, element: 'anyfunc'});

      return instantiate();
    };

    const instantiate = function() {
      return WebAssembly.instantiate(wasm_module, {env: imports}).catch(error_handler);
    };

    return instantiate().then(function(instance) {
      if (instance.exports.__heap_base) {
        memory.set_heap_base(instance.exports.__heap_base);
      }
      if (typeof instance.exports.main === 'function') {
        instance.exports.main();
      }
      return instance;
    });
  });
};
