import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Ajv } from "ajv";
import katex from "katex";
import { parse } from "yaml";
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
}

export interface Chuong {
  schemaVersion: 1;
  lop: number;
  chuong: number;
  ten: string;
  nguon?: string;
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
    const prefix = `l${data.lop}-c${data.chuong}-`;
    data.cauHoi.forEach((q, i) => {
      const where = `${file} câu ${i + 1} (${q.id})`;
      if (!q.id.startsWith(prefix)) errors.push(`${where}: mã phải bắt đầu bằng "${prefix}"`);
      const dup = seenIds.get(q.id);
      if (dup) errors.push(`${where}: trùng mã với ${dup}`);
      seenIds.set(q.id, where);
      const gq: Question = q.loai === "trac-nghiem" ? { loai: q.loai, luaChon: q.luaChon ?? [], dapAn: q.dapAn } : { loai: q.loai, dapAn: q.dapAn };
      for (const msg of validateQuestion(gq)) errors.push(`${where}: ${msg}`);
      for (const text of [q.de, q.goiY, q.loiGiai, ...(q.luaChon ?? [])]) {
        if (text) for (const msg of checkMath(text)) errors.push(`${where}: ${msg}`);
      }
    });
    chuong.push({ file, data });
  }
  return { chuong, errors };
}
