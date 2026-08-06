import { test } from "node:test";
import assert from "node:assert/strict";
import { trackKey } from "../utils/trackKey.js";
import { parseYouTubeUrl } from "../utils/youtube.js";

const ID = "ExGX-8vC7dE";

test("mọi dạng link của cùng một video đều về một khoá", () => {
  const forms = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=RD${ID}&start_radio=1`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
  ];
  for (const url of forms) {
    assert.equal(trackKey({ url }), `yt:${ID}`, url);
  }
});

test("video khác thì khoá khác", () => {
  assert.notEqual(trackKey({ url: `https://youtu.be/${ID}` }), trackKey({ url: "https://youtu.be/dQw4w9WgXcQ" }));
});

test("file upload dùng URL đã bỏ query", () => {
  const key = trackKey({ url: "https://pub-x.r2.dev/uploads/1/a.mp3?token=abc", source: "upload" });
  assert.equal(key, "https://pub-x.r2.dev/uploads/1/a.mp3");
});

test("URL hỏng thì rơi về source:externalId", () => {
  assert.equal(trackKey({ url: "khong-phai-url", source: "upload", externalId: "k1" }), "upload:k1");
});

test("gỡ chặn chỉ chấp nhận link video đơn", () => {
  // Đây là ràng buộc chính của /playlist unblock: dán Mix vào thì một thao tác
  // sẽ gỡ cả rổ bài đã bỏ công loại, nên phải từ chối.
  assert.equal(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)?.kind, "video");
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}`)?.kind, "video");

  for (const notSingle of [
    `https://www.youtube.com/watch?v=${ID}&list=RD${ID}&start_radio=1`,
    `https://www.youtube.com/watch?v=${ID}&list=PLabc`,
    "https://www.youtube.com/playlist?list=PLabc",
  ]) {
    assert.notEqual(parseYouTubeUrl(notSingle)?.kind, "video", notSingle);
  }
});
