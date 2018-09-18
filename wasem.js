import kernel from './kernel.js';

export function load(path, opts) {
  const default_imports = {
    memory: kernel.memory,
    __syscall: function(nr, arg_ptr) { return kernel.memarg_syscall(nr, arg_ptr); },
    __syscall0: function(nr) { return kernel.syscall.apply(kernel, arguments); },
    __syscall1: function(nr, a1) { return kernel.syscall.apply(kernel, arguments); },
    __syscall2: function(nr, a1, a2) { return kernel.syscall.apply(kernel, arguments); },
    __syscall3: function(nr, a1, a2, a3) { return kernel.syscall.apply(kernel, arguments); },
    __syscall4: function(nr, a1, a2, a3, a4) { return kernel.syscall.apply(kernel, arguments); },
    __syscall5: function(nr, a1, a2, a3, a4, a5) { return kernel.syscall.apply(kernel, arguments); },
    __syscall6: function(nr, a1, a2, a3, a4, a5, a6) { return kernel.syscall.apply(kernel, arguments); },
    setjmp: function(jmp_buf_ptr) {
      console.debug("setjmp: " + jmp_buf_ptr);
      return 0;
    },
    longjmp: function(jmp_buf_ptr, ret) {
      console.debug("longjmp: " + jmp_buf_ptr + ", " + ret);
    },
    saveSetjmp: function(env, label, table, size) {
      console.debug("saveSetjmp call with arguments: ");
      console.debug(arguments);
      let env32 = env>>2;
      let table32 = table>>2;
      let setjmpId = ++kernel.setjmpId;
      console.debug("setjmpId: " + setjmpId);
      console.debug("kernel.setjmpId: " + kernel.setjmpId);

      kernel.heap32[env32] = setjmpId;

      for (let i = 0; i < size; i++) {
        if (kernel.heap32[table32 + 2*i] == 0) {
          kernel.heap32[table32] = setjmpId;
          kernel.heap32[table32 + 2*i + 1] = label;
          kernel.heap32[table32 + 2*i + 2] = 0;
        }
      }

      kernel.instance.exports.setTempRet0(size);

      return table;
    },
    emscripten_longjmp_jmpbuf: function(env, value) {
      console.debug("emscripten_longjmp_jmpbuf call with arguments: ");
      console.debug(arguments);
      kernel.instance.exports.setThrew(env, value || 1);
      throw 'longjmp';
    },
    "__invoke_void_%struct.__jmp_buf_tag*_i32": function(func_idx, jmp_buf_ptr, i32) {
      console.debug("__invoke_void_%struct.__jmp_buf_tag*_i32 call with arguments: ");
      console.debug(arguments);
      try {
        return kernel.indirect_function_table.get(func_idx)(jmp_buf_ptr, i32);
      } catch(e) {
        if (e !== 'longjmp') { throw e; }
        kernel.instance.exports.setThrew(1, 0);
      }
    },
    "__invoke_i32_i8*_...": function(func_idx, a1, a2) {
      console.debug("__invoke_i32_i8*_... call with arguments:");
      console.debug(arguments);
      try {
        return kernel.indirect_function_table.get(func_idx)(a1, a2);
      } catch(e) {
        if (e !== 'longjmp') throw e;
        kernel.instance.exports.setThrew(1, 0);
      }
    },
    testSetjmp: function(id, table, size) {
      console.debug("testSetjmp call with arguments: ");
      console.debug(arguments);
      let table32 = table>>2;

      for (let i = 0; i < size; i++) {
        let setjmpId = kernel.heap32[table32 + 2*i];
        if (setjmpId == 0) break;
        if (setjmpId == id) return kernel.heap32[table32 + 2*i + 1];
      }
      console.debug("setjmpId lookup failed");
      return 0;
    },
    emscripten_longjmp: function() {
      console.debug("emscripten_longjmp call with arguments: ");
      console.debug(arguments);
      return 0;
    }
  };

  opts = opts || {};

  return fetch(path).then(function(wasm) {
    let buffer;
    buffer = wasm.arrayBuffer();
    return buffer;
  }).then(function(bytes) {
    let wasm_module;
    wasm_module = WebAssembly.compile(bytes);
    return wasm_module;
  }).then(function (wasm_module) {
    let imports = {};

    for (let key in default_imports) {
      imports[key] = default_imports[key];
    }
    if (opts.custom_imports !== undefined) {
      for (let key in opts.custom_imports) {
        imports[key] = opts.custom_imports[key];
      }
    }
    // Error handling for variable table sizes
    // Don't do this at home
    return WebAssembly.instantiate(wasm_module, {env: imports}).catch(function(err) {
      let matches = err.message.match(/function\=\"(.+)\".*error: (.+)/);
      let table_import_name = matches[1];

      if (matches[2] === "table import requires a WebAssembly.Table") {
        imports[table_import_name] = new WebAssembly.Table({initial: 1, maximum: 1, element: 'anyfunc'});
      }

      return WebAssembly.instantiate(wasm_module, {env: imports}).catch(function (err) {
        let matches = err.message.match(/table import \d+ is smaller than initial (\d+)/);
        let imported_table_size = matches[1];

        imports[table_import_name] = new WebAssembly.Table({initial: imported_table_size, maximum: imported_table_size, element: 'anyfunc'});

        return WebAssembly.instantiate(wasm_module, {env: imports});
      });
    });
  }).then(function(instance) {
    kernel.instance = instance;
    kernel.setHeapBase(instance.exports.__heap_base);
    if (typeof instance.exports.main === 'function') {
      instance.exports.main();
    }
    return instance;
  });
};
