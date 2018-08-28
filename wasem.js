export const kernel = (function () {
  const _this = this;

  const ERRNO = {
    EINVAL: 22,
    ENOSYS: 38
  };

  const memory = new WebAssembly.Memory({initial: 128});
  const heap32 = new Uint32Array(memory.buffer);
  const MEMORY_PAGE_SIZE = 65336;
  const decoder = new TextDecoder('utf-8');
  let HEAP_BASE;
  let HEAP_END;

  function setHeapBase(newBase) {
    HEAP_BASE = newBase;
    if (HEAP_END === undefined || HEAP_END < HEAP_BASE) {
      HEAP_END = HEAP_BASE;
    }
  }

  function setHeapEnd(newEnd) {
    HEAP_END = newEnd;
  }

  function read_str(ptr, len) {
    return decoder.decode(memory.buffer.slice(ptr, ptr + len));
  }

  const syscallMap = {
    4: function(fd, ptr, len) { // write
      if (fd > 2) return -EINVAL;
      console.log(read_str(ptr, len));
      return len;
    },
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

        str = read_str(ptr, len);
        if (str !== '\n') {
          console.log(str);
        }
        bytes += len;
      }

      return bytes;
    },
    265: function(clk_id, res_ptr) { // clock_gettime
      let res_ptr32 = res_ptr / 4;
      let epoch_milliseconds, seconds;

      if (clk_id !== 0) { return -ERRNO.EINVAL; }
      // TODO return EFAULT when res_ptr points outside of memory bounds

      epoch_milliseconds = Date.now();
      seconds = (epoch_milliseconds / 1000) | 0;
      heap32[res_ptr32] = seconds;
      heap32[res_ptr32 + 1] = epoch_milliseconds - (seconds * 1000);

      return 0;
    }
  };
  const syscall = function() {
    const syscallNumber = arguments[0];
    const args = Array.from(arguments).slice(1);
    let syscallFunc, res;

    console.debug("syscall " + syscallNumber + " with " + (arguments[0].length - 1) + " arguments: " + args);
    if (syscallMap.hasOwnProperty(syscallNumber)) {
      syscallFunc = syscallMap[syscallNumber];
      res = syscallFunc.apply(_this, args);
      console.debug("Implementation found, returning result: " + res);
      return res;
    } else {
      // "not implemented"
      res = -ERRNO.ENOSYS;
      console.debug("No implementation found, returning error code: " + res);
      return res;
    }
  };

  const memarg_syscall = function(nr, arg_ptr) {
    const arg_ptr32 = arg_ptr / 4;
    let args = [nr];

    for (let i=0; i < 6; i++) {
      args.push(heap32[arg_ptr32 + i]);
    }

    return syscall.apply(_this, args);
  };

  return {
    ERRNO: ERRNO,
    memory: memory,
    syscall: syscall,
    memarg_syscall: memarg_syscall,
    setHeapBase: setHeapBase,
    read_str: read_str
  };
}());

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
