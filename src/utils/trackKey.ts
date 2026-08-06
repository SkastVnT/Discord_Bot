import { extractYouTubeVideoId } from "./youtube.js";

/**
 * Khoá nhận diện một bài hát, dùng cho danh sách chặn và việc chống trùng.
 *
 * So bằng URL đã chuẩn hoá chứ không bằng tiêu đề: cùng một video vào playlist
 * qua nhiều dạng link (`youtu.be/ID`, `watch?v=ID&list=RD...`, `music.youtube.com`)
 * nên chuỗi URL thô không so trực tiếp được. Với YouTube thì rút về video ID.
 *
 * Bản song song ở web/lib/types.ts — sửa một bên thì sửa cả hai.
 */
export function trackKey(input: { url?: string; source?: string; externalId?: string }): string {
  const videoId = extractYouTubeVideoId(input.url ?? "");
  if (videoId) return `yt:${videoId}`;

  try {
    const url = new URL(input.url ?? "");
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return `${input.source ?? "?"}:${input.externalId ?? input.url ?? "?"}`;
  }
}
