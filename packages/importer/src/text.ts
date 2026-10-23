/**
 * Đọc file chữ (CSV, TSV, chữ dán từ Excel) do giáo viên gửi lên.
 */

export type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1258";

/**
 * Đoán bảng mã. Excel "CSV UTF-8" có BOM; "Văn bản Unicode" là UTF-16; còn "CSV (phân tách bằng dấu
 * phẩy)" trên Windows tiếng Việt lưu bằng Windows-1258, trong đó dấu thanh là ký tự tổ hợp, nên luôn
 * chuẩn hoá về NFC để "ế" gõ kiểu nào cũng là một ký tự.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: Encoding } {
  let encoding: Encoding;
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) [encoding, start] = ["utf-8", 3];
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) [encoding, start] = ["utf-16le", 2];
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) [encoding, start] = ["utf-16be", 2];
  else {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      encoding = "utf-8";
    } catch {
      encoding = "windows-1258";
    }
  }
  const text = new TextDecoder(encoding).decode(bytes.subarray(start));
  return { text: text.normalize("NFC"), encoding };
}

/**
 * Tách CSV theo RFC 4180 (ngoặc kép, xuống dòng trong ô). Tự nhận dấu phân tách: Excel ở máy đặt
 * vùng Việt Nam dùng dấu chấm phẩy vì dấu phẩy đã là dấu thập phân; chữ dán từ Excel dùng Tab.
 * Hiểu cả dòng "sep=;" Excel hay chèn ở đầu.
 */
export function parseCsv(text: string): { rows: string[][]; delimiter: string } {
  let src = text.replace(/^\uFEFF/, "");
  let delimiter: string | null = null;
  const sep = /^sep=(.)\r?\n/i.exec(src);
  if (sep) {
    delimiter = sep[1]!;
    src = src.slice(sep[0].length);
  }
  delimiter ??= detectDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return { rows, delimiter };
}

function detectDelimiter(src: string): string {
  // Đếm trên dòng đầu, bỏ qua phần trong ngoặc kép.
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
  let quoted = false;
  for (const ch of src) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ",";
}

/**
 * Dấu hiệu chữ gõ bằng bảng mã cũ TCVN3 (ABC) hoặc VNI: hiện ra thành ký tự Latin-1 mà tiếng Việt
 * Unicode không dùng, ví dụ "Tr\u00adêng häc" (TCVN3) hay "Tröôøng" (VNI). Bỏ qua × ÷ ° ± ² vì đề Toán có thể dùng.
 */
export function looksLegacyVietnamese(text: string): boolean {
  return (text.match(/[¡-¯´µ¶¸-¿ÄÅÆÇËÎÏÑÖØÛÜÞßäåæçëîïñöøûüþÿ]/g)?.length ?? 0) >= 3;
}

/** Dấu hiệu chữ UTF-8 bị đọc nhầm một lần (ví dụ "Tá»•ng" thay cho "Tổng"). */
export function looksDoubleEncoded(text: string): boolean {
  return /Ã[\u00a0-¿]|áº|á»|Æ°|Ä‘|Ä\u0090/.test(text);
}
