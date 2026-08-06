import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_SIZE,
  applyPageSelection,
  clampPage,
  deselectPage,
  indexesOnPage,
  sanitizeSelection,
  selectAll,
  selectPage,
  totalPages,
} from "../utils/selection.js";

// 60 bài = 3 trang (25 + 25 + 10)
const COUNT = 60;

test("chia trang", () => {
  assert.equal(PAGE_SIZE, 25);
  assert.equal(totalPages(COUNT), 3);
  assert.equal(totalPages(0), 1);
  assert.equal(totalPages(25), 1);
  assert.equal(totalPages(26), 2);
  assert.deepEqual(indexesOnPage(2, COUNT), [50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
});

test("lật trang không làm mất lựa chọn ở trang khác", () => {
  // Trang 0: chọn bài 0 và 3
  let selected = applyPageSelection([], 0, [0, 3], COUNT);
  assert.deepEqual(selected, [0, 3]);

  // Trang 1: chọn bài 30 — lựa chọn ở trang 0 phải còn nguyên
  selected = applyPageSelection(selected, 1, [30], COUNT);
  assert.deepEqual(selected, [0, 3, 30]);

  // Quay lại trang 0 và giữ nguyên tick hiện có → không mất gì
  selected = applyPageSelection(selected, 0, [0, 3], COUNT);
  assert.deepEqual(selected, [0, 3, 30]);
});

test("bỏ tick trong trang hiện tại thì mất khỏi tập chọn", () => {
  // Đây là chỗ union đơn thuần sẽ sai: bỏ tick bài 3 mà nó vẫn còn.
  let selected = applyPageSelection([], 0, [0, 3], COUNT);
  selected = applyPageSelection(selected, 0, [0], COUNT);
  assert.deepEqual(selected, [0]);
});

test("bỏ tick hết một trang không đụng trang khác", () => {
  const selected = applyPageSelection([0, 3, 30], 0, [], COUNT);
  assert.deepEqual(selected, [30]);
});

test("từ chối index không thuộc trang đang thao tác", () => {
  // Giá trị 30 nằm ở trang 1, gửi kèm lúc đang ở trang 0 thì phải bị bỏ.
  const selected = applyPageSelection([], 0, [1, 30, 999, -5], COUNT);
  assert.deepEqual(selected, [1]);
});

test("chọn trang này chỉ ảnh hưởng trang hiện tại", () => {
  const selected = selectPage([59], 0, COUNT);
  assert.equal(selected.length, 26);
  assert.ok(selected.includes(59), "lựa chọn ở trang khác phải còn");
  assert.ok(selected.includes(0) && selected.includes(24));
  assert.ok(!selected.includes(25), "không được lấn sang trang 1");
});

test("bỏ chọn trang này chỉ ảnh hưởng trang hiện tại", () => {
  const selected = deselectPage([0, 5, 30, 55], 0, COUNT);
  assert.deepEqual(selected, [30, 55]);
});

test("chọn tất cả", () => {
  const selected = selectAll(COUNT);
  assert.equal(selected.length, COUNT);
  assert.equal(selected[0], 0);
  assert.equal(selected.at(-1), COUNT - 1);
});

test("không có index trùng lặp", () => {
  const selected = applyPageSelection([2], 0, [2, 2, 2], COUNT);
  assert.deepEqual(selected, [2]);
});

test("sanitize bỏ index ngoài phạm vi và giá trị hỏng", () => {
  assert.deepEqual(sanitizeSelection([-1, 0, 3.5, 59, 60, 1000], COUNT), [0, 59]);
  // Session cũ vẫn còn index của một danh sách dài hơn → phải cắt đi.
  assert.deepEqual(sanitizeSelection([0, 5, 40], 10), [0, 5]);
});

test("clampPage giữ trang trong khoảng hợp lệ", () => {
  assert.equal(clampPage(-1, COUNT), 0);
  assert.equal(clampPage(0, COUNT), 0);
  assert.equal(clampPage(2, COUNT), 2);
  assert.equal(clampPage(99, COUNT), 2);
  assert.equal(clampPage(NaN, COUNT), 0);
  assert.equal(clampPage(1, 0), 0);
});
