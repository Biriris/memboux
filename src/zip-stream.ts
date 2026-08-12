type ZipSource = {
  name: string;
  size: number;
  open: () => Promise<ReadableStream<Uint8Array> | null>;
};

const encoder = new TextEncoder();

function table() {
  return Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    return crc >>> 0;
  });
}

const crcTable = table();
const u16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const u32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true);

function dosDateTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

export function safeZipName(value: string) {
  const segments = value.normalize("NFKC").replaceAll("\\", "/").split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[:*?"<>|\u0000-\u001f]/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  return (segments.join("/") || "file").slice(0, 180);
}

export function createStoredZip(sources: ZipSource[]) {
  if (sources.some((source) => source.size >= 0xffffffff)) throw new Error("zip64_required");
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];
      let offset = 0;
      const push = (chunk: Uint8Array) => { controller.enqueue(chunk); offset += chunk.byteLength; };
      try {
        for (const source of sources) {
          const stream = await source.open();
          if (!stream) continue;
          const name = encoder.encode(safeZipName(source.name));
          const localOffset = offset;
          const stamp = dosDateTime();
          const header = new Uint8Array(30 + name.length);
          const view = new DataView(header.buffer);
          u32(view, 0, 0x04034b50); u16(view, 4, 20); u16(view, 6, 0x0808); u16(view, 8, 0);
          u16(view, 10, stamp.time); u16(view, 12, stamp.date); u16(view, 26, name.length);
          header.set(name, 30); push(header);
          let crc = 0xffffffff;
          let actualSize = 0;
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const byte of value) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
            actualSize += value.byteLength;
            push(value);
          }
          crc = (crc ^ 0xffffffff) >>> 0;
          if (actualSize !== source.size) throw new Error("zip_source_size_changed");
          const descriptor = new Uint8Array(16);
          const descriptorView = new DataView(descriptor.buffer);
          u32(descriptorView, 0, 0x08074b50); u32(descriptorView, 4, crc);
          u32(descriptorView, 8, actualSize); u32(descriptorView, 12, actualSize); push(descriptor);
          central.push({ name, crc, size: actualSize, offset: localOffset });
        }
        const centralOffset = offset;
        for (const entry of central) {
          const stamp = dosDateTime();
          const header = new Uint8Array(46 + entry.name.length);
          const view = new DataView(header.buffer);
          u32(view, 0, 0x02014b50); u16(view, 4, 20); u16(view, 6, 20); u16(view, 8, 0x0808);
          u16(view, 10, 0); u16(view, 12, stamp.time); u16(view, 14, stamp.date); u32(view, 16, entry.crc);
          u32(view, 20, entry.size); u32(view, 24, entry.size); u16(view, 28, entry.name.length);
          u32(view, 42, entry.offset); header.set(entry.name, 46); push(header);
        }
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        u32(endView, 0, 0x06054b50); u16(endView, 8, central.length); u16(endView, 10, central.length);
        u32(endView, 12, offset - centralOffset); u32(endView, 16, centralOffset); push(end);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
