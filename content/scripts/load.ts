import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Ajv } from "ajv";
import katex from "katex";
import { parse } from "yaml";
import { hashKey } from "@tgth/engine";
import { validateQuestion, type Question } from "@tgth/grader";
import schema from "../schema/chuong.schema.json" with { type: "json" };

export interface CauHoi {
  id: string;
  loai: Question["loai"];
  de: string;
  dapAn: string;
  luaChon?: string[];
  goiY?: string;
  loiGiai?: string;
  doKho?: number;
  bai?: string;
  loiSai?: string;
}

/** Một lỗi sai điển hình, cũng là một con quái ban đêm. */
export interface LoiSai {
  ten: string;
  moTa: string;
}

export interface Chuong {
  schemaVersion: 1;
  lop: number;
  chuong: number;
  ten: string;
  nguon?: string;
  loiSai?: Record<string, LoiSai>;
  cauHoi: CauHoi[];
}

export interface LoadedChuong {
  file: string;
  data: Chuong;
}

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile<Chuong>(schema);

/** Kiểm tra từng đoạn $...$ dựng được bằng KaTeX ở chế độ an toàn (không trust, không macro lạ). */
export function checkMath(text: string): string[] {
  const errors: string[] = [];
  const parts = text.split("$");
  if (parts.length % 2 === 0) return ["số dấu $ lẻ, công thức chưa đóng"];
  for (let i = 1; i < parts.length; i += 2) {
    try {
      katex.renderToString(parts[i]!, { throwOnError: true, trust: false, strict: "error" });
    } catch (e) {
      errors.push(`công thức "${parts[i]}": ${(e as Error).message}`);
    }
  }
  return errors;
}

function walkYaml(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return walkYaml(p);
    return /\.ya?ml$/.test(d.name) ? [p] : [];
  });
}

/** Đọc và kiểm định toàn bộ nội dung. Trả về dữ liệu cùng danh sách lỗi dễ đọc cho giáo viên. */
export function loadContent(root: string): { chuong: LoadedChuong[]; errors: string[] } {
  const errors: string[] = [];
  const chuong: LoadedChuong[] = [];
  const seenIds = new Map<string, string>();
  // Cùng một lỗi sai có thể xuất hiện ở nhiều chương, nhưng phải cùng tên quái.
  const seenLoi = new Map<string, { ten: string; file: string }>();

  for (const path of walkYaml(root).sort()) {
    const file = relative(root, path);
    let data: unknown;
    try {
      data = parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${file}: YAML không hợp lệ: ${(e as Error).message}`);
      continue;
    }
    if (!validateSchema(data)) {
      for (const err of validateSchema.errors ?? []) errors.push(`${file}${err.instancePath}: ${err.message}`);
      continue;
    }
    for (const [ma, loi] of Object.entries(data.loiSai ?? {})) {
      const prev = seenLoi.get(ma);
      if (prev && prev.ten !== loi.ten) errors.push(`${file}: lỗi sai "${ma}" tên "${loi.ten}" khác với "${prev.ten}" ở ${prev.file}`);
      seenLoi.set(ma, { ten: loi.ten, file });
      for (const msg of checkMath(loi.moTa)) errors.push(`${file} lỗi sai "${ma}": ${msg}`);
    }
    const prefix = `l${data.lop}-c${data.chuong}-`;
    data.cauHoi.forEach((q, i) => {
      const where = `${file} câu ${i + 1} (${q.id})`;
      if (!q.id.startsWith(prefix)) errors.push(`${where}: mã phải bắt đầu bằng "${prefix}"`);
      const dup = seenIds.get(q.id);
      if (dup) errors.push(`${where}: trùng mã với ${dup}`);
      seenIds.set(q.id, where);
      if (q.loiSai && !data.loiSai?.[q.loiSai]) errors.push(`${where}: lỗi sai "${q.loiSai}" chưa khai báo trong loiSai của chương`);
      const gq: Question = q.loai === "trac-nghiem" ? { loai: q.loai, luaChon: q.luaChon ?? [], dapAn: q.dapAn } : { loai: q.loai, dapAn: q.dapAn };
      for (const msg of validateQuestion(gq)) errors.push(`${where}: ${msg}`);
      for (const text of [q.de, q.goiY, q.loiGiai, ...(q.luaChon ?? [])]) {
        if (text) for (const msg of checkMath(text)) errors.push(`${where}: ${msg}`);
      }
    });
    chuong.push({ file, data });
  }
  errors.push(...checkHashes(chuong));
  return { chuong, errors };
}

/**
 * Mã kết quả chỉ gửi mã băm 15 bit của mã lỗi sai và tên bài; trang giáo viên dò ngược bằng
 * nội dung của lớp. Hai tên cùng lớp trùng mã băm thì bảng lỗi sai sẽ lẫn, nên chặn từ đây.
 * Câu không gắn lỗi sai thì chính mã câu là mã quái, nên cũng tính vào.
 */
function checkHashes(chuong: LoadedChuong[]): string[] {
  const errors: string[] = [];
  for (const lop of new Set(chuong.map((c) => c.data.lop))) {
    const of = chuong.filter((c) => c.data.lop === lop).map((c) => c.data);
    const loi = new Set(of.flatMap((c) => [...Object.keys(c.loiSai ?? {}), ...c.cauHoi.map((q) => q.id)]));
    const bai = new Set(of.flatMap((c) => c.cauHoi.map((q) => q.bai ?? "")));
    for (const [kind, names] of [["mã lỗi sai", loi], ["tên bài", bai]] as const) {
      const seen = new Map<number, string>();
      for (const name of names) {
        const other = seen.get(hashKey(name));
        if (other !== undefined) errors.push(`lớp ${lop}: ${kind} "${name}" trùng mã băm với "${other}", đổi tên một trong hai`);
        seen.set(hashKey(name), name);
      }
    }
  }
  return errors;
}
