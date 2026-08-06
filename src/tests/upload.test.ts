import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedAudio, maxUploadBytes } from "../services/r2.js";
import { canManagePlaylist, isOwner, ownerIds } from "../utils/owners.js";

test("chỉ nhận định dạng audio phát được", () => {
  for (const ok of ["a.mp3", "b.WAV", "c.ogg", "d.m4a", "e.flac", "f.opus", "g.aac", "h.webm"]) {
    assert.ok(isAllowedAudio(ok), `${ok} phải được nhận`);
  }
  for (const bad of ["x.exe", "x.png", "x.pdf", "x.mp4", "x.zip", "x", "x.mp3.exe"]) {
    assert.ok(!isAllowedAudio(bad), `${bad} phải bị chặn`);
  }
});

test("trần upload đọc từ env, có mặc định", () => {
  const saved = process.env.R2_MAX_UPLOAD_MB;

  process.env.R2_MAX_UPLOAD_MB = "25";
  assert.equal(maxUploadBytes(), 25 * 1024 * 1024);

  // Giá trị vô nghĩa phải rơi về mặc định thay vì thành 0 (chặn mọi upload).
  for (const bad of ["", "0", "-5", "abc"]) {
    process.env.R2_MAX_UPLOAD_MB = bad;
    assert.equal(maxUploadBytes(), 50 * 1024 * 1024, `"${bad}" phải dùng mặc định`);
  }

  if (saved === undefined) delete process.env.R2_MAX_UPLOAD_MB;
  else process.env.R2_MAX_UPLOAD_MB = saved;
});

test("BOT_OWNER_IDS đọc được nhiều ID", () => {
  const saved = process.env.BOT_OWNER_IDS;

  // Đây chính là lý do dùng một biến dạng danh sách: khai `BOT_OWNER_ID=` hai lần
  // trong .env thì dotenv chỉ giữ dòng cuối và ID đầu biến mất không báo gì.
  process.env.BOT_OWNER_IDS = "111, 222 ,333";
  assert.deepEqual(ownerIds(), ["111", "222", "333"]);
  assert.ok(isOwner("111") && isOwner("333"));
  assert.ok(!isOwner("444"));

  process.env.BOT_OWNER_IDS = "";
  assert.deepEqual(ownerIds(), []);
  assert.ok(!isOwner("111"));

  if (saved === undefined) delete process.env.BOT_OWNER_IDS;
  else process.env.BOT_OWNER_IDS = saved;
});

test("quyền thao tác playlist", () => {
  const saved = process.env.BOT_OWNER_IDS;
  process.env.BOT_OWNER_IDS = "999";

  assert.ok(canManagePlaylist("abc", "abc"), "chủ playlist thao tác được");
  assert.ok(canManagePlaylist("999", "abc"), "chủ bot thao tác được playlist người khác");
  assert.ok(!canManagePlaylist("xyz", "abc"), "người lạ thì không");

  if (saved === undefined) delete process.env.BOT_OWNER_IDS;
  else process.env.BOT_OWNER_IDS = saved;
});
