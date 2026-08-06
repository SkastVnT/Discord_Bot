/**
 * Logic tick chọn bài, tách riêng và thuần túy để test được mà không cần Discord
 * lẫn MongoDB.
 *
 * VÌ SAO PHẢI CÓ RIÊNG: select menu của Discord chỉ báo về những option đang được
 * tick TRONG TRANG HIỆN TẠI. Nếu cứ hợp (union) danh sách nhận được vào tập đã
 * chọn thì thao tác BỎ tick sẽ không có tác dụng — bài đã bỏ vẫn nằm trong tập.
 * Ngược lại nếu thay thế toàn bộ tập bằng danh sách nhận được thì lựa chọn ở các
 * trang khác biến mất. Cách đúng là chỉ thay phần thuộc trang hiện tại.
 */

export const PAGE_SIZE = 25;

export function totalPages(trackCount: number): number {
  return Math.max(1, Math.ceil(trackCount / PAGE_SIZE));
}

/** Các index thuộc trang `page` (0-based), giới hạn trong `trackCount`. */
export function indexesOnPage(page: number, trackCount: number): number[] {
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, trackCount);
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

function sortedUnique(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Áp lựa chọn mới của MỘT trang lên tập đã chọn toàn cục.
 *
 *     tập mới = (tập cũ \ mọi index thuộc trang) ∪ (index vừa nhận, đã lọc hợp lệ)
 */
export function applyPageSelection(
  selected: number[],
  page: number,
  received: number[],
  trackCount: number,
): number[] {
  const onPage = new Set(indexesOnPage(page, trackCount));
  const next = new Set(selected.filter((i) => !onPage.has(i)));
  for (const value of received) {
    // Chỉ nhận index nằm đúng trang đang thao tác: chặn cả giá trị bịa đặt lẫn
    // giá trị lạc từ một trang khác.
    if (onPage.has(value)) next.add(value);
  }
  return sortedUnique(next);
}

/** Tick hết các bài trong trang hiện tại, không đụng tới trang khác. */
export function selectPage(selected: number[], page: number, trackCount: number): number[] {
  return sortedUnique([...selected, ...indexesOnPage(page, trackCount)]);
}

/** Bỏ tick toàn bộ trang hiện tại, không đụng tới trang khác. */
export function deselectPage(selected: number[], page: number, trackCount: number): number[] {
  const onPage = new Set(indexesOnPage(page, trackCount));
  return selected.filter((i) => !onPage.has(i));
}

export function selectAll(trackCount: number): number[] {
  return Array.from({ length: trackCount }, (_, i) => i);
}

/** Bỏ index ngoài phạm vi — dữ liệu cũ trong session vẫn có thể chứa rác. */
export function sanitizeSelection(selected: number[], trackCount: number): number[] {
  return sortedUnique(
    selected.filter((i) => Number.isInteger(i) && i >= 0 && i < trackCount),
  );
}

export function clampPage(page: number, trackCount: number): number {
  const max = totalPages(trackCount) - 1;
  if (!Number.isInteger(page) || page < 0) return 0;
  return Math.min(page, max);
}
