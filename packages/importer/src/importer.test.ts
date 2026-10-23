import { describe, expect, it } from "vitest";
import {
  decodeText,
  fixNumberAnswer,
  importRows,
  parseCsv,
  readFile,
  readPasted,
  readXlsx,
  templateCsv,
  templateXlsx,
  writeXlsx,
  type Cell,
} from "./index";

const cells = (rows: string[][]): Cell[][] => rows.map((r) => r.map((text) => ({ text })));
const HEADER = ["Mã câu", "Loại", "Đề bài", "Đáp án", "Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Độ khó", "Lỗi sai hay gặp"];
const ctx = { lop: 7, chuong: 1, existing: [{ id: "l7-c1-0007", de: "Tính $1+1$." }], loiSai: { "cong-tu-mau": { ten: "Nhện Cộng Mẫu" } } };

describe("bảng mã", () => {
  it("nhận UTF-8 có và không có BOM", () => {
    const utf8 = new TextEncoder().encode("Đề bài");
    expect(decodeText(utf8)).toEqual({ text: "Đề bài", encoding: "utf-8" });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])).text).toBe("Đề bài");
  });

  it("nhận UTF-16 của Excel (Văn bản Unicode)", () => {
    const s = "Đáp án\t1/2";
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < s.length; i++) new DataView(bytes.buffer).setUint16(2 + i * 2, s.charCodeAt(i), true);
    expect(decodeText(bytes)).toEqual({ text: s, encoding: "utf-16le" });
  });

  it("đọc Windows-1258 (dấu thanh tổ hợp) và chuẩn hoá NFC", () => {
    // "Tiến" trong Windows-1258: T i ê (0xEA) + dấu sắc tổ hợp (0xEC) n
    const r = decodeText(new Uint8Array([0x54, 0x69, 0xea, 0xec, 0x6e]));
    expect(r.encoding).toBe("windows-1258");
    expect(r.text).toBe("Tiến");
    expect(r.text.length).toBe(4);
  });
});

describe("CSV", () => {
  it("tự nhận dấu phân tách và xử lý ngoặc kép, xuống dòng trong ô", () => {
    expect(parseCsv('a;b\r\n"x;1";"dòng 1\ndòng 2"\r\n')).toEqual({ rows: [["a", "b"], ["x;1", "dòng 1\ndòng 2"]], delimiter: ";" });
    expect(parseCsv('a,b\n"nói ""chào""",2').rows[1]).toEqual(['nói "chào"', "2"]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
    expect(parseCsv("sep=;\na;b").rows).toEqual([["a", "b"]]);
  });
});

describe("đáp án loại số", () => {
  it.each([
    ["01/02/2026", "1/2"],
    ["5/6/2026", "5/6"],
    ["2-Jan", "1/2"],
    ["Mar-45", "3/45"],
  ])("gỡ ngày tháng Excel tự đổi: %s → %s", (text, value) => {
    const r = fixNumberAnswer({ text });
    expect(r.value).toBe(value);
    expect(r.warning).toBeTruthy();
  });

  it("ô ngày trong .xlsx thì báo lỗi vì không biết ngày/tháng hay tháng/ngày", () => {
    expect(fixNumberAnswer({ text: "1/2/2026", date: { y: 2026, m: 2, d: 1 } }).error).toMatch(/1\/2 hoặc 2\/1/);
  });

  it("dấu phẩy thập phân, dấu trừ dài, dấu nháy của Excel", () => {
    expect(fixNumberAnswer({ text: "0,25" })).toEqual({ value: "0,25" });
    expect(fixNumberAnswer({ text: "–3" })).toEqual({ value: "-3" });
    expect(fixNumberAnswer({ text: "'1/2" })).toEqual({ value: "1/2" });
  });

  it("cảnh báo số có thể là hàng nghìn, báo lỗi khi có nhiều dấu ngăn cách", () => {
    expect(fixNumberAnswer({ text: "1.000" }).warning).toMatch(/đọc là 1/);
    expect(fixNumberAnswer({ text: "1.000.000" }).error).toMatch(/hàng nghìn/);
    expect(fixNumberAnswer({ text: "50%" }).error).toBeTruthy();
    expect(fixNumberAnswer({ text: "abc" }).error).toBeTruthy();
  });
});

describe("importRows", () => {
  it("đọc câu số và trắc nghiệm, tự đánh mã sau mã lớn nhất đã có", () => {
    const r = importRows(
      cells([
        HEADER,
        ["VD1", "số", "Ví dụ", "1", "", "", "", "", ""],
        ["", "số", "Tính $\\frac{1}{2}+\\frac{1}{3}$.", "5/6", "", "", "", "1", "Nhện Cộng Mẫu"],
        ["", "", "Chọn số lớn nhất.", "c", "$1$", "$2$", "$3$", "khó", ""],
        [],
      ]),
      ctx,
    );
    expect(r.issues).toEqual([]);
    expect(r.examples).toBe(1);
    expect(r.cauHoi).toEqual([
      { row: 3, q: { id: "l7-c1-0008", loai: "so", de: "Tính $\\frac{1}{2}+\\frac{1}{3}$.", dapAn: "5/6", loiSai: "cong-tu-mau", doKho: 1 } },
      { row: 4, q: { id: "l7-c1-0009", loai: "trac-nghiem", de: "Chọn số lớn nhất.", luaChon: ["$1$", "$2$", "$3$"], dapAn: "C", doKho: 3 } },
    ]);
  });

  it("chỉ ra dòng và cột bị lỗi, bỏ dòng lỗi khỏi kết quả", () => {
    const r = importRows(
      cells([
        ["Câu hỏi Toán 7"],
        HEADER,
        ["l7-c1-0007", "số", "Tính $1+1$.", "2", "", "", "", "", ""],
        ["l7-c1-0020", "số", "Tính $\\frac{1}{2$.", "x", "", "", "", "4", "quen-doi-dau"],
        ["l7-c1-0020", "trắc nghiệm", "Chọn.", "D", "1", "", "3", "", ""],
        ["l8-c1-0001", "số", "Tính 2 + 2.", "4", "", "", "", "", ""],
      ]),
      ctx,
    );
    expect(r.cauHoi).toEqual([]);
    const at = (row: number) => r.issues.filter((i) => i.row === row && i.level === "loi").map((i) => i.column);
    expect(at(3)).toEqual(["Mã câu"]);
    expect(r.issues.find((i) => i.row === 3 && i.level === "canh-bao")?.message).toMatch(/giống hệt câu l7-c1-0007/);
    expect(at(4).sort()).toEqual(["Lỗi sai hay gặp", "Đáp án", "Đề bài", "Độ khó"].sort());
    expect(at(5)).toContain("Mã câu");
    expect(at(5)).toContain("Lựa chọn C");
    expect(at(6)).toEqual(["Mã câu"]);
  });

  it("cảnh báo lệnh công thức nằm ngoài $...$", () => {
    const r = importRows(cells([HEADER, ["", "", "Tính \\frac{1}{2}.", "1/2"]]), ctx);
    expect(r.cauHoi).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ row: 2, column: "Đề bài", level: "canh-bao" });
  });

  it("cảnh báo dấu phẩy thập phân trong công thức", () => {
    const r = importRows(cells([HEADER, ["", "", "Tính $0,5 + 0{,}25$.", "0,75"]]), ctx);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]?.message).toMatch(/0\{,\}5/);
  });

  it("báo khi không có dòng tiêu đề", () => {
    expect(importRows(cells([["a", "b"]]), ctx).issues[0]?.level).toBe("loi");
  });
});

describe("xlsx", () => {
  it("ghi rồi đọc lại được, giữ dấu tiếng Việt và ký tự đặc biệt", async () => {
    const bytes = writeXlsx([{ name: "Câu hỏi", rows: [["Đề bài", "Đáp án"], ["Tính $a<b$ & \"c\"", "1/2"]], header: true }]);
    const wb = await readXlsx(bytes);
    expect(wb.sheets[0]?.name).toBe("Câu hỏi");
    expect(wb.sheets[0]?.rows).toEqual(cells([["Đề bài", "Đáp án"], ['Tính $a<b$ & "c"', "1/2"]]));
  });

  it("mẫu .xlsx đọc lại ra đúng ba câu ví dụ, không lỗi", async () => {
    const opts = { lop: 7, chuong: 1, ten: "Số hữu tỉ", loiSai: { "cong-tu-mau": { ten: "Nhện Cộng Mẫu", moTa: "..." } } };
    const table = await readFile("mau.xlsx", templateXlsx(opts));
    expect(table.source).toMatch(/Câu hỏi/);
    const r = importRows(table.rows, ctx);
    expect(r).toMatchObject({ examples: 3, issues: [], cauHoi: [] });
    // Bỏ "VD" thì cả ba câu đều hợp lệ.
    const asReal = table.rows.map((row, i) => (i === 0 ? row : [{ text: "" }, ...row.slice(1)]));
    expect(importRows(asReal, ctx).cauHoi).toHaveLength(3);
  });

  it("đọc ô số, ô ngày và chuỗi dùng chung của file Excel thật (nén DEFLATE)", async () => {
    // Tự dựng một .xlsx kiểu Excel: sharedStrings, ô số có sai số dấu phẩy động, ô ngày theo định dạng 14.
    const { deflateRawSync } = await import("node:zlib");
    const enc = new TextEncoder();
    const files: Record<string, string> = {
      "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>Đề bài</t></si><si><r><t>Đáp </t></r><r><t>án</t></r></si></sst>",
      "xl/styles.xml": '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3"><v>0.30000000000000004</v></c><c r="C3" s="1"><v>46054</v></c></row></sheetData></worksheet>',
    };
    const zip = await import("./zip");
    const deflated = Object.entries(files).map(([name, xml]) => ({ name, data: enc.encode(xml), comp: new Uint8Array(deflateRawSync(enc.encode(xml))) }));
    // Ghi ZIP bằng writeZip rồi vá phương thức nén thành DEFLATE.
    const stored = zip.writeZip(deflated.map((f) => ({ name: f.name, data: f.comp })));
    const view = new DataView(stored.buffer);
    for (let i = 0; i + 4 <= stored.length; i++) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50) view.setUint16(i + 8, 8, true);
      if (sig === 0x02014b50) view.setUint16(i + 10, 8, true);
    }
    const wb = await readXlsx(stored);
    const rows = wb.sheets[0]!.rows;
    expect(rows[0]?.map((c) => c.text)).toEqual(["Đề bài", "", "Đáp án"]);
    expect(rows[1]).toEqual([]);
    expect(rows[2]?.[0]).toEqual({ text: "0.3" });
    expect(rows[2]?.[2]).toEqual({ text: "1/2/2026", date: { y: 2026, m: 2, d: 1 } });
  });

  it("báo file .xls đời cũ", async () => {
    await expect(readFile("cu.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/\.xls/);
  });
});

describe("CSV và chữ dán", () => {
  it("mẫu CSV có BOM và đọc lại không lỗi", async () => {
    const csv = templateCsv({ lop: 7, chuong: 1 });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const table = await readFile("mau.csv", new TextEncoder().encode(csv));
    expect(table.source).toMatch(/UTF-8, phân tách bằng dấu phẩy/);
    expect(importRows(table.rows, ctx)).toMatchObject({ examples: 3, issues: [] });
  });

  it("chữ dán từ Excel phân tách bằng Tab", () => {
    const t = readPasted("Đề bài\tĐáp án\nTính $2+3$.\t5\n");
    expect(importRows(t.rows, ctx).cauHoi[0]?.q.dapAn).toBe("5");
  });

  it("cảnh báo chữ TCVN3 và chữ UTF-8 bị đọc nhầm", () => {
    expect(readPasted("Tr\u00adêng häc\tTÝnh tæng").warnings[0]).toMatch(/TCVN3/);
    expect(readPasted("Tá»•ng").warnings[0]).toMatch(/bảng mã/);
    expect(readPasted("Tính tổng").warnings).toEqual([]);
  });
});
