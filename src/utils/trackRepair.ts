import type { Track, TrackMiddleware } from "ziplayer";
import { extractYouTubeVideoId, toSingleVideoUrl } from "./youtube.js";

/**
 * Vá metadata thiếu của track ngay trước khi lấy stream.
 *
 * VÌ SAO CẦN: `YouTubePlugin.buildTrack()` tính thời lượng bằng
 * `Number(raw.duration.text) * 1000`. Với track lấy từ playlist hoặc Mix feed,
 * `duration.text` là chuỗi kiểu "4:20" nên `Number("4:20")` ra NaN — và cùng lúc
 * feed cũng không trả tên kênh. Bài đầu tiên thì đủ dữ liệu vì nó đi qua
 * `getBasicInfo`, nơi thời lượng là `length_seconds` dạng số.
 *
 * Đó là lý do bài đầu của một Mix hiển thị bình thường còn các bài sau thành
 * "Thời lượng N/A" + "Unknown Artist" và mất luôn thanh tiến trình.
 *
 * Cách vá: hỏi lại plugin bằng URL video đơn, đường đó đi qua `getBasicInfo`.
 *
 * Chạy ở hook `trackMiddleware` — ngay trước khi extract stream, đúng lúc dữ liệu
 * thực sự cần đến, và chỉ với track thiếu nên phần lớn track không tốn request nào.
 */
export const repairTrackMetadata: TrackMiddleware = async (track, { player }) => {
  const needsDuration = !Number.isFinite(track.duration) || track.duration <= 0;
  const needsAuthor = !authorOf(track);
  if (!needsDuration && !needsAuthor) return;

  // Chỉ vá được track có URL video YouTube; nguồn khác bỏ qua.
  const videoId = extractYouTubeVideoId(track.url ?? "");
  const singleUrl = toSingleVideoUrl(track.url ?? "");
  if (!videoId || !singleUrl) return;

  try {
    const result = await player.search(singleUrl, track.requestedBy);
    const fresh = result?.tracks?.[0];
    if (!fresh) return;

    // Đảm bảo đúng video: search có thể rơi về tìm-theo-tên và trả về bài khác.
    if (extractYouTubeVideoId(fresh.url ?? "") !== videoId) {
      console.warn(`[track] repair bỏ qua: kết quả trả về video khác (${track.title})`);
      return;
    }

    const before = { duration: track.duration, author: authorOf(track) };

    if (needsDuration && Number.isFinite(fresh.duration) && fresh.duration > 0) {
      track.duration = fresh.duration;
    }

    if (needsAuthor) {
      const author = authorOf(fresh);
      if (author) {
        track.author = author;
        track.metadata = { ...(track.metadata ?? {}), author };
      }
    }

    if (!track.thumbnail && fresh.thumbnail) track.thumbnail = fresh.thumbnail;

    console.log(
      `[track] repaired "${track.title}" duration=${before.duration}→${track.duration} ` +
        `author=${before.author || "(trống)"}→${authorOf(track) || "(trống)"}`,
    );
  } catch (err) {
    // Middleware ném lỗi sẽ CHẶN phát nhạc. Vá được thì tốt, không được thì thôi —
    // phần hiển thị đã có nhánh "không rõ tổng thời lượng" để đỡ.
    console.warn(`[track] repair failed cho "${track.title}": ${(err as Error).message}`);
  }
};

/** YouTubePlugin đặt tên kênh vào metadata.author, không đặt Track.author. */
function authorOf(track: Track): string {
  const meta = track.metadata?.author;
  return track.author || (typeof meta === "string" ? meta : "") || "";
}
