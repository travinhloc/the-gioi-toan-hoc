/**
 * Sổ Tay: mỗi lỗi sai là một trang. Trang đến hạn thì đêm đó hóa thành quái.
 * Thu phục quái thì trang lùi lịch theo REVIEW_DAYS; thu phục đủ các mốc thì trang được xóa.
 */
export interface NotebookEntry {
  /** Mã lỗi sai (`loiSai` của câu); câu chưa gắn lỗi sai thì dùng mã câu. */
  readonly loi: string;
  /** Câu gần nhất em sai với lỗi này. */
  readonly questionId: string;
  /** 0 = vừa sai; mỗi lần thu phục tăng 1. */
  readonly box: number;
  /** Ngày (GameState.day) quái xuất hiện. */
  readonly due: number;
}

export type Notebook = readonly NotebookEntry[];

/** Thu phục xong thì quái quay lại sau 1, 3, 7 rồi 14 ngày. */
export const REVIEW_DAYS = [1, 3, 7, 14] as const;

/** Ghi một lỗi mới: quái xuất hiện ngay đêm nay, lịch ôn tính lại từ đầu. */
export function recordMistake(nb: Notebook, loi: string, questionId: string, day: number): Notebook {
  const entry: NotebookEntry = { loi, questionId, box: 0, due: day };
  return nb.some((e) => e.loi === loi) ? nb.map((e) => (e.loi === loi ? entry : e)) : [...nb, entry];
}

export function dueEntries(nb: Notebook, day: number): NotebookEntry[] {
  return nb.filter((e) => e.due <= day);
}

/** Thu phục: lùi lịch sang mốc kế tiếp, hoặc xóa trang nếu đã qua mốc cuối. */
export function capture(nb: Notebook, loi: string, day: number): Notebook {
  return nb.flatMap((e) => {
    if (e.loi !== loi) return [e];
    const wait = REVIEW_DAYS[e.box];
    return wait === undefined ? [] : [{ ...e, box: e.box + 1, due: day + wait }];
  });
}

/** Quái chạy thoát: không phạt gì, chỉ quay lại vào đêm sau. */
export function escape(nb: Notebook, loi: string, day: number): Notebook {
  return nb.map((e) => (e.loi === loi ? { ...e, box: 0, due: day + 1 } : e));
}
