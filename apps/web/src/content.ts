import type { BankQuestion } from "@tgth/engine";

export interface ContentIndex {
  schemaVersion: number;
  version: string;
  chuong: { lop: number; chuong: number; ten: string; soCau: number; path: string }[];
}

/** Một lỗi sai điển hình, cũng là một con quái ban đêm. */
export interface LoiSai {
  ten: string;
  moTa: string;
}

interface ChuongFile {
  schemaVersion: number;
  loiSai?: Record<string, LoiSai>;
  cauHoi: (BankQuestion & { goiY?: string; loiGiai?: string; bai?: string })[];
}

export type ContentQuestion = ChuongFile["cauHoi"][number];

const SUPPORTED_SCHEMA = 1;

/**
 * Game chỉ đọc bản phát hành JSON (index.json + mỗi chương một file), không đọc YAML.
 * VITE_CONTENT_URL cho phép trỏ sang bản phát hành ở repo nội dung riêng sau này.
 */
const BASE = new URL(import.meta.env.VITE_CONTENT_URL ?? "./content/", document.baseURI);

export async function loadIndex(): Promise<ContentIndex> {
  const index = (await (await fetch(new URL("index.json", BASE))).json()) as ContentIndex;
  if (index.schemaVersion !== SUPPORTED_SCHEMA) {
    throw new Error(`Bản nội dung dùng schemaVersion ${index.schemaVersion}, game này chỉ hiểu ${SUPPORTED_SCHEMA}.`);
  }
  return index;
}

export async function loadBank(
  lop: number,
): Promise<{ version: string; bank: ContentQuestion[]; loiSai: Record<string, LoiSai> }> {
  const index = await loadIndex();
  const files = await Promise.all(
    index.chuong
      .filter((c) => c.lop === lop)
      .map(async (c) => (await (await fetch(new URL(c.path, BASE))).json()) as ChuongFile),
  );
  return {
    version: index.version,
    bank: files.flatMap((f) => f.cauHoi),
    loiSai: Object.assign({}, ...files.map((f) => f.loiSai ?? {})) as Record<string, LoiSai>,
  };
}
