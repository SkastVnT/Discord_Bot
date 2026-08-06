/**
 * Đọc URL/URI Spotify.
 *
 * Nhận cả hai dạng người dùng hay dán:
 *   https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb
 *   https://open.spotify.com/intl-vi/album/xxx        (Spotify chèn mã ngôn ngữ)
 *   spotify:playlist:37i9dQZF1DXcBWIGoYBM5M           (URI từ nút Copy Spotify URI)
 */

export type SpotifyKind = "track" | "album" | "playlist";

export interface ParsedSpotifyUrl {
  kind: SpotifyKind;
  id: string;
}

const KINDS: SpotifyKind[] = ["track", "album", "playlist"];

/** ID của Spotify là base62, luôn 22 ký tự. */
const ID_PATTERN = /^[A-Za-z0-9]{22}$/;

const ALLOWED_HOSTS = ["open.spotify.com", "play.spotify.com"];

export function parseSpotifyUrl(input: string): ParsedSpotifyUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  // Dạng URI: spotify:track:<id>
  if (raw.toLowerCase().startsWith("spotify:")) {
    const parts = raw.split(":");
    const kind = parts[1]?.toLowerCase() as SpotifyKind | undefined;
    const id = parts[2];
    if (kind && KINDS.includes(kind) && id && ID_PATTERN.test(id)) return { kind, id };
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // So khớp hostname CHÍNH XÁC — `open.spotify.com.attacker.example` phải bị loại.
  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) return null;

  // Bỏ các đoạn đường dẫn không phải loại tài nguyên, ví dụ "intl-vi" mà Spotify
  // chèn vào khi chia sẻ từ giao diện tiếng Việt.
  const segments = url.pathname.split("/").filter(Boolean);
  for (let i = 0; i < segments.length - 1; i++) {
    const kind = segments[i]!.toLowerCase() as SpotifyKind;
    const id = segments[i + 1]!;
    if (KINDS.includes(kind) && ID_PATTERN.test(id)) return { kind, id };
  }

  return null;
}

export function isSpotifyUrl(input: string): boolean {
  return parseSpotifyUrl(input) !== null;
}

/**
 * Câu tìm kiếm YouTube cho một bài Spotify.
 *
 * Bỏ các hậu tố phiên bản trong tên bài — "(Remastered 2011)", "- Radio Edit" —
 * vì chúng gần như không bao giờ xuất hiện trong tiêu đề video YouTube và chỉ
 * làm kết quả khớp tệ đi.
 */
export function buildYouTubeQuery(title: string, artists: string[]): string {
  const cleanTitle = title
    .replace(/\s*[([][^)\]]*(remaster|remastered|radio edit|mono|stereo|deluxe|bonus)[^)\]]*[)\]]/gi, "")
    .replace(/\s*-\s*(remaster(ed)?|radio edit|mono|stereo)\b.*$/i, "")
    .trim();

  // Chỉ lấy hai nghệ sĩ đầu: danh sách feat dài làm câu tìm kiếm quá hẹp.
  const who = artists.slice(0, 2).join(" ");
  return `${who} ${cleanTitle || title}`.trim();
}
