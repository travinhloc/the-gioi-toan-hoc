/**
 * Mã nhiệm vụ giáo viên giao: 15 kí tự Crockford base32 (XXXXX-XXXXX-XXXXX), đủ ngắn để
 * đọc to hay gõ tay, và cũng là phần đuôi của link (#nv=...). Không cần máy chủ: mọi thông
 * tin nằm ngay trong mã.
 *
 * 75 bit = 65 bit dữ liệu + 10 bit kiểm tra:
 *   phiên bản 3 · lớp 2 (lớp - 6) · chương 16 (bit i = chương i + 1) · số câu 6 · hạn 14
 *   (số ngày kể từ 2026-01-01, 0 = không hạn) · mã nhiệm vụ 24 (ngẫu nhiên).
 * Mã kiểm tra (xem code.ts) bắt được gõ nhầm một kí tự hay đảo hai kí tự cạnh nhau. Mã chỉ
 * chống gõ nhầm, không chống làm giả.
 */
import { ALPHABET, bitReader, group, normalize, packFields, verify, withChecksum } from "./code";

export interface Mission {
  readonly lop: number;
  /** Các chương (vùng mỏ) được giao, tăng dần. */
  readonly chuong: readonly number[];
  /** Số câu đúng cần đạt. */
  readonly soCau: number;
  /** Hạn dạng YYYY-MM-DD, hoặc null nếu không hạn. */
  readonly han: string | null;
  /** Mã ngẫu nhiên 24 bit để phân biệt hai lần giao giống nhau; mã kết quả sẽ gắn với nó. */
  readonly id: number;
}

const VERSION = 1;
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
const DATA_CHARS = 13;
const MAX_SO_CAU = 63;
const MAX_CHUONG = 16;
const MAX_HAN_DAYS = (1 << 14) - 1;

export type MissionResult = { ok: true; mission: Mission } | { ok: false; error: string };

function toDays(han: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(han);
  if (!m) throw new Error(`Hạn "${han}" phải có dạng YYYY-MM-DD`);
  const days = (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EPOCH) / DAY_MS;
  if (!Number.isInteger(days) || days < 1 || days > MAX_HAN_DAYS) throw new Error(`Hạn "${han}" nằm ngoài khoảng hỗ trợ`);
  return days;
}

function fromDays(days: number): string {
  return new Date(EPOCH + days * DAY_MS).toISOString().slice(0, 10);
}

export function encodeMission(m: Mission): string {
  if (m.lop < 6 || m.lop > 9) throw new Error("Lớp phải từ 6 đến 9");
  if (m.chuong.length === 0) throw new Error("Cần chọn ít nhất một chương");
  if (m.chuong.some((c) => !Number.isInteger(c) || c < 1 || c > MAX_CHUONG)) throw new Error(`Chương phải từ 1 đến ${MAX_CHUONG}`);
  if (!Number.isInteger(m.soCau) || m.soCau < 1 || m.soCau > MAX_SO_CAU) throw new Error(`Số câu phải từ 1 đến ${MAX_SO_CAU}`);
  if (!Number.isInteger(m.id) || m.id < 0 || m.id >= 1 << 24) throw new Error("Mã nhiệm vụ phải là số 24 bit");

  const mask = m.chuong.reduce((acc, c) => acc | (1 << (c - 1)), 0);
  const fields: [number, number][] = [
    [VERSION, 3],
    [m.lop - 6, 2],
    [mask, 16],
    [m.soCau, 6],
    [m.han ? toDays(m.han) : 0, 14],
    [m.id, 24],
  ];
  return group(withChecksum(packFields(fields)));
}

export function decodeMission(code: string): MissionResult {
  // Chấp nhận chữ thường, dấu cách, gạch nối, và các chữ dễ nhầm O/I/L.
  const text = normalize(code);
  if (text.length !== DATA_CHARS + 2) return { ok: false, error: "Mã nhiệm vụ phải có đúng 15 kí tự." };
  if ([...text].some((ch) => !ALPHABET.includes(ch))) return { ok: false, error: "Mã nhiệm vụ có kí tự không hợp lệ." };
  const data = verify(text);
  if (!data) return { ok: false, error: "Mã nhiệm vụ bị gõ nhầm ở đâu đó, em kiểm tra lại từng kí tự nhé." };

  const { read } = bitReader(data);
  const version = read(3);
  if (version !== VERSION) return { ok: false, error: "Mã nhiệm vụ này cần bản game mới hơn." };
  const lop = read(2) + 6;
  const mask = read(16);
  const soCau = read(6);
  const hanDays = read(14);
  const id = read(24);
  const chuong = Array.from({ length: MAX_CHUONG }, (_, i) => i + 1).filter((c) => mask & (1 << (c - 1)));
  if (chuong.length === 0 || soCau === 0) return { ok: false, error: "Mã nhiệm vụ không hợp lệ." };
  return { ok: true, mission: { lop, chuong, soCau, han: hanDays ? fromDays(hanDays) : null, id } };
}

/** Câu thuộc nhiệm vụ nếu mã câu (l7-c1-0001) nằm ở lớp và chương được giao. */
export function inMission(m: Mission, questionId: string): boolean {
  const match = /^l(\d)-c(\d{1,2})-/.exec(questionId);
  return !!match && Number(match[1]) === m.lop && m.chuong.includes(Number(match[2]));
}

/** Đọc mã nhiệm vụ từ đuôi link, ví dụ https://.../#nv=ABCDE-FGHJK-MNPQR. */
export function missionFromHash(hash: string): string | null {
  const match = /(?:^#|&)nv=([^&]+)/.exec(hash);
  return match ? decodeURIComponent(match[1]!) : null;
}
