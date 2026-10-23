/**
 * Đọc và ghi file ZIP vừa đủ cho .xlsx. Ghi thì không nén (STORE) cho đơn giản; đọc thì
 * hiểu cả STORE lẫn DEFLATE (giải nén bằng DecompressionStream có sẵn trong trình duyệt và Node).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Ghép các file thành một ZIP không nén. Tên file mã hoá UTF-8. */
export function writeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // Ngày giờ DOS cố định (2026-01-01 00:00) để cùng đầu vào luôn ra cùng file.
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // tên file là UTF-8
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, 0, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, dosDate, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true);
    dir.setUint32(24, f.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }

  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

interface ByteStream {
  writable: { getWriter(): { write(b: Uint8Array): Promise<void>; close(): Promise<void> } };
  readable: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (format: string) => ByteStream }).DecompressionStream;
  if (!DS) throw new Error("Trình duyệt này không giải nén được file Excel. Hãy lưu thành CSV UTF-8 rồi chọn lại.");
  const ds = new DS("deflate-raw");
  const writer = ds.writable.getWriter();
  // Không chờ write xong mới đọc, kẻo kẹt vì luồng đầy.
  const done = writer.write(data).then(() => writer.close());
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    if (value) parts.push(value);
  }
  await done;
  return concat(parts);
}

/** Đọc mọi file trong một ZIP. Báo lỗi dễ hiểu nếu không phải ZIP. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("File không phải Excel .xlsx (có thể là .xls cũ: hãy mở bằng Excel rồi lưu lại dạng .xlsx).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("File .xlsx bị hỏng (mục lục ZIP sai).");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`File .xlsx dùng kiểu nén lạ (${method}).`);
  }
  return out;
}
