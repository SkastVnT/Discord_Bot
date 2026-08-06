/**
 * Chuẩn hóa thời lượng track về mili-giây.
 *
 * VÌ SAO CẦN: `@ziplayer/plugin@0.3.4` gán `Track.duration` bằng
 * `Number(toSeconds(...)) || 0`, và `toSeconds()` trả về GIÂY
 * (xem node_modules/@ziplayer/plugin/dist/YouTubePlugin.js:522).
 * ZiPlayer core che chuyện này bằng một phép đoán trong `getTime()`:
 *
 *     const total = track.duration > 1000 ? track.duration : track.duration * 1000;
 *
 * Phép đoán đó sai với video dài hơn 1000 giây (16 phút 40): một video 20 phút
 * có duration = 1200 nên bị coi là 1200 mili-giây.
 *
 * Ở biên import ta biết chắc nguồn dữ liệu nên chuẩn hóa dứt điểm một lần rồi
 * ghi `durationMs` xuống database, thay vì để mỗi chỗ đọc tự đoán lại.
 */

/** Ngưỡng coi một con số là "chắc chắn đã là mili-giây". */
const MAX_PLAUSIBLE_SECONDS = 24 * 3600; // 24 giờ

/**
 * Đổi `Track.duration` của ziplayer sang mili-giây.
 *
 * Plugin luôn trả giây, nên mặc định nhân 1000. Chỉ khi con số lớn đến mức vô lý
 * khi hiểu là giây (trên 24 giờ) mới coi nó vốn đã là mili-giây — trường hợp này
 * xảy ra nếu một plugin khác trả sẵn ms.
 */
export function trackDurationToMs(duration: number | undefined | null): number | undefined {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return undefined;
  return duration > MAX_PLAUSIBLE_SECONDS ? Math.round(duration) : Math.round(duration * 1000);
}

/**
 * Đọc thời lượng từ dữ liệu thô của yt-dlp.
 *
 * yt-dlp trả `duration` là số giây (có thể là số thực), hoặc `duration_string`
 * dạng "4:20" khi chạy với --flat-playlist.
 */
export function parseYtdlpDuration(
  duration: unknown,
  durationString: unknown,
): number | undefined {
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return Math.round(duration * 1000);
  }
  if (typeof durationString === "string") {
    const parts = durationString.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return undefined;
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part!;
    return seconds > 0 ? seconds * 1000 : undefined;
  }
  return undefined;
}

/** Mili-giây → "M:SS" hoặc "H:MM:SS". Trả "—" khi không biết. */
export function formatMs(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
