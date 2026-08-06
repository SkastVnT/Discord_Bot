import { test } from "node:test";
import assert from "node:assert/strict";
import { buildYouTubeQuery, isSpotifyUrl, parseSpotifyUrl } from "../utils/spotify.js";

const ID = "6habFhsOp2NvshLv26DqMb";

test("nhận ba loại URL Spotify", () => {
  assert.deepEqual(parseSpotifyUrl(`https://open.spotify.com/track/${ID}`), { kind: "track", id: ID });
  assert.deepEqual(parseSpotifyUrl(`https://open.spotify.com/album/${ID}`), { kind: "album", id: ID });
  assert.deepEqual(parseSpotifyUrl(`https://open.spotify.com/playlist/${ID}`), {
    kind: "playlist",
    id: ID,
  });
});

test("bỏ qua mã ngôn ngữ Spotify chèn vào đường dẫn", () => {
  // Chia sẻ từ app tiếng Việt ra link dạng /intl-vi/track/<id>.
  assert.deepEqual(parseSpotifyUrl(`https://open.spotify.com/intl-vi/track/${ID}`), {
    kind: "track",
    id: ID,
  });
});

test("nhận cả dạng URI", () => {
  assert.deepEqual(parseSpotifyUrl(`spotify:track:${ID}`), { kind: "track", id: ID });
  assert.deepEqual(parseSpotifyUrl(`spotify:album:${ID}`), { kind: "album", id: ID });
});

test("bỏ query thừa như ?si=", () => {
  assert.deepEqual(parseSpotifyUrl(`https://open.spotify.com/track/${ID}?si=abc123&nd=1`), {
    kind: "track",
    id: ID,
  });
});

test("từ chối hostname giả mạo và loại không hỗ trợ", () => {
  assert.equal(parseSpotifyUrl(`https://open.spotify.com.attacker.example/track/${ID}`), null);
  assert.equal(parseSpotifyUrl(`https://evil.example/open.spotify.com/track/${ID}`), null);
  // Podcast không phải nhạc.
  assert.equal(parseSpotifyUrl(`https://open.spotify.com/episode/${ID}`), null);
  assert.equal(parseSpotifyUrl(`https://open.spotify.com/artist/${ID}`), null);
});

test("từ chối ID sai định dạng và protocol lạ", () => {
  assert.equal(parseSpotifyUrl("https://open.spotify.com/track/qua-ngan"), null);
  assert.equal(parseSpotifyUrl(`javascript:alert(1)//open.spotify.com/track/${ID}`), null);
  assert.equal(parseSpotifyUrl(""), null);
  assert.equal(parseSpotifyUrl("https://www.youtube.com/watch?v=abc"), null);
});

test("isSpotifyUrl khớp với parseSpotifyUrl", () => {
  assert.ok(isSpotifyUrl(`https://open.spotify.com/album/${ID}`));
  assert.ok(!isSpotifyUrl("https://youtu.be/abc"));
});

test("câu tìm kiếm YouTube bỏ hậu tố phiên bản", () => {
  // Những hậu tố này gần như không có trong tiêu đề video YouTube nên giữ lại
  // chỉ làm kết quả khớp tệ đi.
  assert.equal(
    buildYouTubeQuery("Bohemian Rhapsody - Remastered 2011", ["Queen"]),
    "Queen Bohemian Rhapsody",
  );
  assert.equal(buildYouTubeQuery("Song (Radio Edit)", ["A"]), "A Song");
  assert.equal(buildYouTubeQuery("Normal Title", ["A", "B"]), "A B Normal Title");
});

test("chỉ lấy hai nghệ sĩ đầu", () => {
  // Danh sách feat dài làm câu tìm kiếm quá hẹp, không ra kết quả nào.
  assert.equal(buildYouTubeQuery("X", ["A", "B", "C", "D"]), "A B X");
});

test("tên bài chỉ gồm hậu tố thì giữ nguyên bản gốc", () => {
  // Nếu cắt xong rỗng thì phải quay lại tên gốc, không được trả câu tìm rỗng.
  assert.equal(buildYouTubeQuery("(Remastered)", ["A"]), "A (Remastered)");
});
