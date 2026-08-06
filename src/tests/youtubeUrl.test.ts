import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeUrl } from "../utils/youtube.js";

const ACCEPTANCE =
  "https://www.youtube.com/watch?v=ExGX-8vC7dE&list=RDExGX-8vC7dE&start_radio=1";

test("video đơn", () => {
  const r = parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(r?.kind, "video");
  assert.equal(r?.videoId, "dQw4w9WgXcQ");
  assert.equal(r?.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("link rút gọn youtu.be", () => {
  const r = parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(r?.kind, "video");
  assert.equal(r?.videoId, "dQw4w9WgXcQ");
});

test("shorts được chuẩn hóa thành video", () => {
  const r = parseYouTubeUrl("https://www.youtube.com/shorts/abc12345678");
  assert.equal(r?.kind, "video");
  assert.equal(r?.videoId, "abc12345678");
});

test("music.youtube.com được chấp nhận", () => {
  const r = parseYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(r?.kind, "video");
});

test("playlist thường", () => {
  const r = parseYouTubeUrl("https://www.youtube.com/playlist?list=PLabcdef");
  assert.equal(r?.kind, "playlist");
  assert.equal(r?.listId, "PLabcdef");
  assert.equal(r?.videoId, undefined);
});

test("video nằm trong playlist giữ cả hai id", () => {
  const r = parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdef");
  assert.equal(r?.kind, "video_in_playlist");
  assert.equal(r?.videoId, "dQw4w9WgXcQ");
  assert.equal(r?.listId, "PLabcdef");
});

test("acceptance URL: Mix RD nhận đúng video gốc", () => {
  const r = parseYouTubeUrl(ACCEPTANCE);
  assert.equal(r?.kind, "mix");
  assert.equal(r?.videoId, "ExGX-8vC7dE");
  assert.equal(r?.listId, "RDExGX-8vC7dE");
  // Mix phải giữ NGUYÊN videoId trong canonical URL: bỏ đi thì YouTube không biết
  // lấy bài nào làm gốc để sinh danh sách.
  assert.match(r!.canonicalUrl, /v=ExGX-8vC7dE/);
  assert.match(r!.canonicalUrl, /list=RDExGX-8vC7dE/);
});

test("từ chối hostname giả mạo", () => {
  assert.equal(parseYouTubeUrl("https://youtube.com.attacker.example/watch?v=abc"), null);
  assert.equal(parseYouTubeUrl("https://evil.example/youtube.com/watch?v=abc"), null);
  assert.equal(parseYouTubeUrl("https://notyoutube.com/watch?v=abc"), null);
});

test("từ chối protocol không phải http/https", () => {
  assert.equal(parseYouTubeUrl("javascript:alert(1)//youtube.com"), null);
  assert.equal(parseYouTubeUrl("file:///etc/passwd"), null);
  assert.equal(parseYouTubeUrl("ftp://youtube.com/watch?v=abc"), null);
});

test("từ chối rác và chuỗi quá dài", () => {
  assert.equal(parseYouTubeUrl(""), null);
  assert.equal(parseYouTubeUrl("   "), null);
  assert.equal(parseYouTubeUrl("không phải url"), null);
  assert.equal(parseYouTubeUrl(`https://youtube.com/watch?v=${"a".repeat(3000)}`), null);
});

test("URL YouTube không có video lẫn list thì bỏ", () => {
  assert.equal(parseYouTubeUrl("https://www.youtube.com/feed/subscriptions"), null);
});
