import * as ERRNO from './errno.js';
import { file_table } from './fs.js';

const syscall_map = {
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
    file_table.get(fd).write(this.memory.read_str(ptr, len));
    return len;
  },
  5: function(path_ptr, flags) { // open
    const path = this.memory.read_str(path_ptr);
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
    let new_heap_end;

    if (this.memory.get_heap_base() >= addr) {
      new_heap_end = this.memory.get_heap_base();
    } else {
      new_heap_end = addr;
    }

    this.memory.set_heap_end(new_heap_end);
    return this.memory.get_heap_end();
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
      let ptr = this.memory.heap32[ptr_addr];
      let len = this.memory.heap32[ptr_addr + 1];
      let str;

      if (len == 0) { continue; }

      file_table.get(fd).write(this.memory.read_str(ptr, len));

      bytes += len;
    }

    return bytes;
  },
  175: function(how, set, oldset, sigsetsize) { // rt_sigprocmask
    // assuming this syscall has no meaning in wasm context
    return 0;
  },
  221: function(fd, cmd, arg) { // fcntl64
    const file_descriptor = file_table.get(fd);
    if (cmd === F_SETFD) {
      file_descriptor.flags = file_descriptor.flags & arg;
    }
    return 0;
  },
  224: function() { // gettid
    // assuming we have only one process with one thread for now
    return 1;
  },
  238: function(tid, sig) { // tkill
    // assuming signals have no meaning in wasm context
    return 0;
  },
  265: function(clk_id, res_ptr) { // clock_gettime
    let res_ptr32 = res_ptr / 4;
    let epoch_milliseconds, seconds;

    if (clk_id !== 0) { return -ERRNO.EINVAL; }
    // TODO return EFAULT when res_ptr points outside of memory bounds

    epoch_milliseconds = Date.now();
    seconds = (epoch_milliseconds / 1000) | 0;
    this.memory.heap32[res_ptr32] = seconds;
    this.memory.heap32[res_ptr32 + 1] = epoch_milliseconds - (seconds * 1000);

    return 0;
  }
};

export default function(memory) {
  this.memory = memory;

  this.syscall = function() {
    const syscall_number = arguments[0];
    const syscall_args = Array.from(arguments).slice(1);
    let syscall_func, result;

    console.debug("syscall " + syscall_number + " with " + syscall_args.length + " arguments: " + syscall_args);

    syscall_func = syscall_map[syscall_number];

    if (typeof syscall_func === 'function') {
      result = syscall_func.apply(this, syscall_args);
      console.debug("Implementation found, returning result: " + result);
    } else {
      result = -ERRNO.ENOSYS;
      console.debug("No implementation found, returning error code: " + result);
    }
    return result | 0;
  };

  this.memarg_syscall = function(nr, arg_ptr) {
    const arg_ptr32 = arg_ptr / 4;
    let args = [nr];

    for (let i=0; i < 6; i++) {
      args.push(memory.heap32[arg_ptr32 + i]);
    }

    return this.syscall.apply(this, args);
  };

  return this;
};
