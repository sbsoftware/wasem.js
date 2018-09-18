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
    setjmp: function(a1) { console.debug("setjmp call"); return 0; },
    longjmp: function(a1, a2) {
      console.debug("longjmp call");
      try {
        throw new Error;
      } catch {
        console.debug("catched error");
      }
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
    return WebAssembly.instantiate(wasm_module, {env: imports});
  }).then(function(instance) {
    kernel.setHeapBase(instance.exports.__heap_base);
    if (typeof instance.exports.main === 'function') {
      instance.exports.main();
    }
    return instance;
  });
};
