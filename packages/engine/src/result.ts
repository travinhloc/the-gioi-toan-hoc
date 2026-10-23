/**
 * Mã kết quả học sinh gửi lại cho giáo viên (qua Zalo), dạng KQ-XXXXX-XXXXX-...
 * Chỉ chứa: mã nhiệm vụ, số thứ tự của em trong lớp, đúng/sai theo bài và các lỗi sai đã mắc.
 * Không có tên, không có gì khác về em; game không gửi gì đi, em tự tay chép mã.
 *
 * Bit: phiên bản 3 · mã nhiệm vụ 24 · số thứ tự 6 · số bài 4 · số lỗi 4, rồi
 *   mỗi bài: tên bài băm 15 · đúng 5 · sai 5
 *   mỗi lỗi: mã lỗi băm 15 · số lần sai 4 · đã thu phục 1
 * cộng 2 kí tự kiểm tra. Mỗi danh sách giữ tối đa 15 mục nhiều nhất, số đếm chặn ở giá trị lớn
 * nhất của trường. Mã chống gõ nhầm và chống lẫn nhiệm vụ, không chống làm giả: chỉ dùng để
 * biết lớp yếu ở đâu, không dùng chấm điểm.
 */
import { bitReader, group, hashKey, normalize, packFields, verify, withChecksum } from "./code";
import type { GameState } from "./game";

export interface KetQua {
  readonly missionId: number;
  /** Số thứ tự của em trong sổ lớp, 1–63. */
  readonly stt: number;
  /** key = hashKey(tên bài). */
  readonly bai: readonly { readonly key: number; readonly dung: number; readonly sai: number }[];
  /** key = hashKey(mã lỗi sai), cùng mã quái trong Sổ Tay. */
  readonly loi: readonly { readonly key: number; readonly sai: number; readonly thuPhuc: boolean }[];
}

export type KetQuaResult = { ok: true; ketQua: KetQua } | { ok: false; error: string };

const VERSION = 1;
const PREFIX = "KQ";
const MAX_STT = 63;
const MAX_ITEMS = 15;

const cap = (n: number, bits: number) => Math.min(n, (1 << bits) - 1);

/** Kết quả của nhiệm vụ đang làm. Lỗi tính là đã thu phục khi em đánh thắng quái từ lần sai gần nhất. */
export function resultOf(state: GameState, stt: number): KetQua | null {
  const m = state.mission;
  if (!m) return null;
  return {
    missionId: m.id,
    stt,
    bai: Object.entries(m.bai)
      .sort(([, a], [, b]) => b.dung + b.sai - (a.dung + a.sai))
      .slice(0, MAX_ITEMS)
      .map(([ten, v]) => ({ key: hashKey(ten), dung: cap(v.dung, 5), sai: cap(v.sai, 5) })),
    loi: Object.entries(m.loi)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_ITEMS)
      .map(([loi, sai]) => {
        const entry = state.notebook.find((e) => e.loi === loi);
        return { key: hashKey(loi), sai: cap(sai, 4), thuPhuc: !entry || entry.box > 0 };
      }),
  };
}

export function encodeResult(k: KetQua): string {
  if (!Number.isInteger(k.stt) || k.stt < 1 || k.stt > MAX_STT) throw new Error(`Số thứ tự phải từ 1 đến ${MAX_STT}`);
  if (k.bai.length > MAX_ITEMS || k.loi.length > MAX_ITEMS) throw new Error("Quá nhiều mục trong mã kết quả");
  const fields: [number, number][] = [
    [VERSION, 3],
    [k.missionId, 24],
    [k.stt, 6],
    [k.bai.length, 4],
    [k.loi.length, 4],
    ...k.bai.flatMap((b): [number, number][] => [[b.key, 15], [cap(b.dung, 5), 5], [cap(b.sai, 5), 5]]),
    ...k.loi.flatMap((l): [number, number][] => [[l.key, 15], [cap(l.sai, 4), 4], [l.thuPhuc ? 1 : 0, 1]]),
  ];
  return `${PREFIX}-${group(withChecksum(packFields(fields)))}`;
}

export function decodeResult(code: string): KetQuaResult {
  const text = normalize(code);
  if (!text.startsWith(PREFIX)) return { ok: false, error: "Mã kết quả phải bắt đầu bằng KQ." };
  const data = verify(text.slice(PREFIX.length));
  if (!data) return { ok: false, error: "Mã kết quả bị gõ nhầm hoặc bị cắt mất một đoạn." };

  const { read, left } = bitReader(data);
  if (left() < 41) return { ok: false, error: "Mã kết quả quá ngắn." };
  if (read(3) !== VERSION) return { ok: false, error: "Mã kết quả này cần bản trang giáo viên mới hơn." };
  const missionId = read(24);
  const stt = read(6);
  const nBai = read(4);
  const nLoi = read(4);
  // Phần còn lại phải vừa khít các mục, chỉ dư vài bit 0 cho tròn kí tự.
  const rest = left() - nBai * 25 - nLoi * 20;
  if (stt === 0 || rest < 0 || rest >= 5) return { ok: false, error: "Mã kết quả không hợp lệ." };
  const bai = Array.from({ length: nBai }, () => ({ key: read(15), dung: read(5), sai: read(5) }));
  const loi = Array.from({ length: nLoi }, () => ({ key: read(15), sai: read(4), thuPhuc: read(1) === 1 }));
  return { ok: true, ketQua: { missionId, stt, bai, loi } };
}

/** Tìm mọi mã kết quả trong một đoạn chữ dán từ Zalo (lẫn tên, giờ gửi, lời nhắn...). */
export function findResultCodes(text: string): string[] {
  return text.match(/\bKQ(?:-[0-9A-Z]{1,5})+/gi) ?? [];
}

export interface BoardRow {
  readonly key: number;
  /** Số thứ tự các em đã mắc lỗi này. */
  readonly mac: readonly number[];
  /** Trong số đó, các em chưa thu phục được quái: cần thầy cô hỗ trợ. */
  readonly canHoTro: readonly number[];
  readonly lanSai: number;
}

export interface BaiRow {
  readonly key: number;
  readonly dung: number;
  readonly sai: number;
  readonly soEm: number;
}

export interface Board {
  /** Mỗi em một kết quả, xếp theo số thứ tự. */
  readonly hocSinh: readonly KetQua[];
  readonly loi: readonly BoardRow[];
  readonly bai: readonly BaiRow[];
}

/**
 * Bảng lỗi sai của cả lớp. Một em gửi nhiều lần thì lấy lần sau cùng (kết quả mới nhất),
 * nên giáo viên cứ dán cả đoạn chat, không cần lọc trùng.
 */
export function buildBoard(results: readonly KetQua[]): Board {
  const latest = new Map<number, KetQua>();
  for (const r of results) latest.set(r.stt, r);
  const hocSinh = [...latest.values()].sort((a, b) => a.stt - b.stt);

  const loi = new Map<number, { mac: number[]; canHoTro: number[]; lanSai: number }>();
  const bai = new Map<number, { dung: number; sai: number; soEm: number }>();
  for (const r of hocSinh) {
    for (const l of r.loi) {
      const row = loi.get(l.key) ?? { mac: [], canHoTro: [], lanSai: 0 };
      row.mac.push(r.stt);
      if (!l.thuPhuc) row.canHoTro.push(r.stt);
      row.lanSai += l.sai;
      loi.set(l.key, row);
    }
    for (const b of r.bai) {
      const row = bai.get(b.key) ?? { dung: 0, sai: 0, soEm: 0 };
      row.dung += b.dung;
      row.sai += b.sai;
      row.soEm += 1;
      bai.set(b.key, row);
    }
  }
  return {
    hocSinh,
    loi: [...loi].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.mac.length - a.mac.length || b.lanSai - a.lanSai),
    bai: [...bai].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.sai / (b.dung + b.sai) - a.sai / (a.dung + a.sai)),
  };
}
