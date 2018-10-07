export const FD_CLOEXEC = 1;
export const F_SETFD = 2;

function __write_stdout(str) {
  if (str === "\n") { return; }
  console.log(str);
}

function __write_stderr(str) {
  if (str === "\n") { return; }
  console.error(str);
}

export const file_table = (function () {
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
