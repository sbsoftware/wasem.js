const kernel = (function () {
  const ERRNO = {
    EINVAL: 22,
    ENOSYS: 38
  };

  const memory = new WebAssembly.Memory({initial: 128});
  const heap32 = new Uint32Array(memory.buffer);
  const MEMORY_PAGE_SIZE = 65336;
  let HEAP_BASE;
  let HEAP_END;

  function setHeapBase(newBase) {
    console.debug("Old Heap base: " + HEAP_BASE);
    HEAP_BASE = newBase;
    console.debug("New Heap base: " + HEAP_BASE);
    if (HEAP_END === undefined || HEAP_END < HEAP_BASE) {
      HEAP_END = HEAP_BASE;
    }
  }

  function setHeapEnd(newEnd) {
    console.debug("Old Heap end: " + HEAP_END);
    HEAP_END = newEnd;
    console.debug("New Heap end: " + HEAP_END);
  }

  const syscallMap = {
    45: function(addr) { // brk
      let newHeapEnd;
      // TODO grow memory if needed
      if (HEAP_BASE >= addr) {
        newHeapEnd = HEAP_BASE;
      } else {
        newHeapEnd = addr;
      }
      setHeapEnd(newHeapEnd);
      return HEAP_END;
    },
    54: function(fd, cmd, arg) { // ioctl
      return 0;
    },
    146: function(fd, iovec, iovcnt) { // writev
      // no writing to actual files since we have no filesystem
      if (fd > 2) { return -1; }

      let bytes = 0;

      for (let i = 0; i < iovcnt; i++) {
        let ptr_addr = (iovec / 4) + (2 * i);
        let ptr = heap32[ptr_addr];
        let len = heap32[ptr_addr + 1];
        let str;

        if (len == 0) { continue; }

        str = new TextDecoder('utf-8').decode(memory.buffer.slice(ptr, ptr+len));
        if (str !== '\n') {
          console.log(str);
        }
        bytes += len;
      }

      return bytes;
    }
  };
  const syscall = function() {
    const syscallNumber = arguments[0][0];
    const args = Array.from(arguments[0]).slice(1);
    let syscallFunc, res;

    console.debug("syscall " + syscallNumber + " with " + (arguments[0].length - 1) + " arguments: " + args);
    if (syscallMap.hasOwnProperty(syscallNumber)) {
      syscallFunc = syscallMap[syscallNumber];
      res = syscallFunc.apply(null, args);
      console.debug("Implementation found, returning result: " + res);
      return res;
    } else {
      // "not implemented"
      res = -ERRNO.ENOSYS;
      console.debug("No implementation found, returning error code: " + res);
      return res;
    }
  };

  return {
    ERRNO: ERRNO,
    memory: memory,
    syscall: syscall,
    setHeapBase: setHeapBase
  };
}());

export function load(path) {
  const imports = {
    env: {
      memory: kernel.memory,
      __indirect_function_table: new WebAssembly.Table({initial: 255, maximum: 255, element: 'anyfunc'}),
      __syscall0: function(a1) { return kernel.syscall(arguments); },
      __syscall1: function(a1, a2) { return kernel.syscall(arguments); },
      __syscall2: function(a1, a2, a3) { return kernel.syscall(arguments); },
      __syscall3: function(a1, a2, a3, a4) { return kernel.syscall(arguments); },
      __syscall4: function(a1, a2, a3, a4, a5) { return kernel.syscall(arguments); },
      __syscall5: function(a1, a2, a3, a4, a5, a6) { return kernel.syscall(arguments); },
      __syscall6: function(a1, a2, a3, a4, a5, a6, a7) { return kernel.syscall(arguments); },
      setjmp: function(a1) { console.debug("setjmp call"); return 0; },
      longjmp: function(a1, a2) { 
        console.debug("longjmp call");
        try {
          throw new Error;
        } catch {
          console.debug("catched error");
        }
      }
    }
  };

  return fetch(path).then(function(wasm) {
    let buffer;
    buffer = wasm.arrayBuffer();
    return buffer;
  }).then(function(bytes) {
    let wasm_module;
    wasm_module = WebAssembly.compile(bytes);
    return wasm_module;
  }).then(function (wasm_module) {
    return WebAssembly.instantiate(wasm_module, imports);
  }).then(function(instance) {
    kernel.setHeapBase(instance.exports.__heap_base);
    if (typeof instance.exports.main === 'function') {
      instance.exports.main();
    }
    return instance;
  });
};
