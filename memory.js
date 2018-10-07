export const PAGE_SIZE = 65336;

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder('utf-8');

export default function () {
  let memory;
  let heap8, heap32, heap_base, heap_end;

  const set_heap = function(memory) {
    heap8 = new Uint8Array(memory.buffer);
    heap32 = new Uint32Array(memory.buffer);
  };

  const grow = function(pages) {
    memory.grow(pages);
    set_heap(memory);
  };

  const set_heap_base = function(new_base) {
    if (heap_base !== undefined) throw new Error("Cannot reset heap base");

    heap_base = new_base;

    if (heap_end === undefined || heap_end < heap_base) {
      set_heap_end(heap_base);
    }
  };

  const get_heap_base = function() {
    if (heap_base === undefined) throw new Error("Heap base is not set");

    return heap_base;
  };

  const set_heap_end = function(new_end) {
    if (new_end < heap_end) throw new Error("Cannot decrease heap size");

    if (memory.buffer.byteLength < new_end) {
      let inc_bytes = new_end - memory.buffer.byteLength;
      let inc_pages = Math.ceil(inc_bytes / PAGE_SIZE);
      grow(inc_pages);
    }

    heap_end = new_end;
  };

  const get_heap_end = function() {
    return heap_end;
  };

  const read_str = function(ptr, len) {
    let str_bytes = [heap8[ptr]];
    while(str_bytes.length !== len && heap8[ptr + str_bytes.length] !== 0) {
      str_bytes.push(heap8[ptr + str_bytes.length]);
    }
    return decoder.decode(new Uint8Array(str_bytes));
  };

  const write_str = function(ptr, str) {
  };

  memory = new WebAssembly.Memory({initial: 128});
  set_heap(memory);

  return {
    memory: memory,
    set_heap_base: set_heap_base,
    get_heap_base: get_heap_base,
    set_heap_end: set_heap_end,
    get_heap_end: get_heap_end,
    heap8: heap8,
    heap32: heap32,
    grow: grow,
    read_str: read_str,
    write_str: write_str
  };
};
