/** Đọc file hoặc chữ dán vào thành bảng ô, nhận biết loại file và bảng mã. */
import { fold } from "./bang";
import { decodeText, looksDoubleEncoded, looksLegacyVietnamese, parseCsv } from "./text";
import { readXlsx, type Cell } from "./xlsx";

export interface Table {
  rows: Cell[][];
  /** Mô tả nguồn cho thầy cô, ví dụ "CSV, bảng mã Windows-1258, phân tách bằng dấu ;". */
  source: string;
  warnings: string[];
}

const DELIM: Record<string, string> = { ",": "dấu phẩy", ";": "dấu chấm phẩy", "\t": "Tab" };
const ENC: Record<string, string> = { "utf-8": "UTF-8", "utf-16le": "UTF-16", "utf-16be": "UTF-16", "windows-1258": "Windows-1258" };

function textWarnings(rows: Cell[][]): string[] {
  const all = rows.flatMap((r) => r.map((c) => c.text)).join("\n");
  const w: string[] = [];
  if (looksDoubleEncoded(all)) w.push('Chữ có dấu bị lỗi (kiểu "Tá»•ng"). File có thể đã bị lưu sai bảng mã: mở file gốc rồi lưu lại dạng "CSV UTF-8", hoặc dùng mẫu .xlsx.');
  if (looksLegacyVietnamese(all)) w.push("Chữ có vẻ được gõ bằng bảng mã cũ TCVN3 (ABC) hoặc VNI. Hãy chuyển sang Unicode (Unikey: Công cụ, Chuyển mã) rồi chọn lại file.");
  return w;
}

function fromText(text: string, what: string): Table {
  const { rows, delimiter } = parseCsv(text);
  const cells = rows.map((r) => r.map((t) => ({ text: t })));
  return { rows: cells, source: `${what}, phân tách bằng ${DELIM[delimiter] ?? `"${delimiter}"`}`, warnings: textWarnings(cells) };
}

export async function readFile(name: string, bytes: Uint8Array): Promise<Table> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const wb = await readXlsx(bytes);
    const sheet = wb.sheets.find((s) => fold(s.name) === "cau hoi") ?? wb.sheets[0]!;
    return { rows: sheet.rows, source: `Excel .xlsx, trang "${sheet.name}"`, warnings: textWarnings(sheet.rows) };
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error(`"${name}" là file Excel đời cũ (.xls). Hãy mở bằng Excel, chọn Lưu thành, kiểu "Sổ làm việc Excel (.xlsx)".`);
  }
  const { text, encoding } = decodeText(bytes);
  return fromText(text, `File chữ, bảng mã ${ENC[encoding]}`);
}

/** Chữ dán thẳng từ Excel hoặc Google Trang tính (các ô cách nhau bằng Tab). */
export function readPasted(text: string): Table {
  return fromText(text.normalize("NFC"), "Chữ dán vào");
}
