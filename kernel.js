import * as ERRNO from './errno.js';

const MEMORY_PAGE_SIZE = 65336;

const FD_CLOEXEC = 1;
const F_SETFD = 2;

export default (function () {
  const _this = this;

  const memory = new WebAssembly.Memory({initial: 128});
  const heap8 = new Uint8Array(memory.buffer);
  const heap32 = new Uint32Array(memory.buffer);
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder('utf-8');
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
    let str_bytes = [heap8[ptr]];
    while(str_bytes.length !== len && heap8[ptr + str_bytes.length] !== 0) {
      str_bytes.push(heap8[ptr + str_bytes.length]);
    }
    return decoder.decode(new Uint8Array(str_bytes));
  }

  function __write_stdout(str) {
    if (str === "\n") { return; }
    console.log(str);
  }

  function __write_stderr(str) {
    if (str === "\n") { return; }
    console.error(str);
  }

  const file_table = (function () {
    const file_descriptors = {
      1: {write: __write_stdout},
      2: {write: __write_stderr}
    }

    const read_dom_el = function(path, len) {
      let str, res;
      if (path === '/dev/document/html') {
        str = document.getRootNode().children[0].outerHTML;
      } else {
        str = '';
      }
      res = str.slice(this.offset, this.offset + len);
      this.offset = res.length;
      return res;
    }

    const exists = function(fd) {
      return file_descriptors.hasOwnProperty(fd);
    }

    return {
      exists: exists,
      get: function(fd) {
        return file_descriptors[fd];
      },
      open: function(path, flags) {
        let fd = 3;

        // get lowest unoccupied file descriptor
        while(exists(fd)) { fd++; }

        file_descriptors[fd] = (function(path, flags) {
          let context = {
            offset: 0
          }

          return {
            write: function(){},
            read: read_dom_el.bind(context, path)
          };
        }(path, flags));
        return fd;
      },
      close: function(fd) {
        delete file_descriptors[fd];
        return true;
      }
    };
  }());

  const syscallMap = {
    3: function(fd, buf_ptr, len) { // read
      if (!file_table.exists(fd)) { return -ERRNO.EBADF; }

      let str = file_table.get(fd).read(len);

      let str_bytes = encoder.encode(str);
      for (let i = 0; i < str_bytes.length; i++) {
        heap8[buf_ptr + i] = str_bytes[i];
      }
      return str_bytes.length;
    },
    4: function(fd, ptr, len) { // write
      if (fd > 2) return -EINVAL;
      file_table.get(fd).write(read_str(ptr, len));
      return len;
    },
    5: function(path_ptr, flags) { // open
      const path = read_str(path_ptr);
      if (path.slice(0, 18) !== '/dev/document/html') {
        return -ERRNO.ENOENT;
      }
      return file_table.open(path, flags);
    },
    6: function(fd) { // close
      file_table.close(fd);
      return 0;
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

        file_table.get(fd).write(read_str(ptr, len));

        bytes += len;
      }

      return bytes;
    },
    221: function(fd, cmd, arg) { // fcntl64
      const file_descriptor = file_table.get(fd);
      if (cmd === F_SETFD) {
        file_descriptor.flags = file_descriptor.flags & arg;
      }
      return 0;
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

    console.debug("syscall " + syscallNumber + " with " + (arguments.length - 1) + " arguments: " + args);
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

  let setjmpId = 0;

  return {
    memory: memory,
    heap8: heap8,
    heap32: heap32,
    syscall: syscall,
    memarg_syscall: memarg_syscall,
    setHeapBase: setHeapBase,
    read_str: read_str,
    setjmpId: setjmpId
  };
}());
