// Toàn bộ logic đọc/ghép URL YouTube nằm ở đây.
// Trước đây play.ts và livelyrics.ts mỗi file tự có một bản tách video ID riêng,
// hơi khác nhau về host được chấp nhận — gom lại để không lệch nhau nữa.

const LONG_HOSTS = ["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com"];

export function extractYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (LONG_HOSTS.includes(host)) {
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractYouTubeListId(input: string): string | null {
  try {
    return new URL(input).searchParams.get("list");
  } catch {
    return null;
  }
}

/** YouTube Mix/Radio là playlist động, id luôn bắt đầu bằng "RD". */
export function isYouTubeMix(input: string): boolean {
  return extractYouTubeListId(input)?.toUpperCase().startsWith("RD") ?? false;
}

export function isYouTubeUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return host === "youtu.be" || LONG_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/**
 * URL video đơn, bỏ mọi tham số playlist.
 *
 * Cần cho lúc đi hỏi lại metadata của một track: nếu giữ `list=RD...` thì plugin
 * sẽ tải lại cả Mix chỉ để lấy thời lượng một bài.
 */
export function toSingleVideoUrl(input: string): string | null {
  const videoId = extractYouTubeVideoId(input);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function buildYouTubeSearchCandidates(query: string): string[] {
  const candidates = [query];
  const videoId = extractYouTubeVideoId(query);
  if (!videoId) return candidates;

  const listId = extractYouTubeListId(query);
  const canonicalUrl = listId
    ? `https://www.youtube.com/watch?v=${videoId}&list=${encodeURIComponent(listId)}`
    : `https://www.youtube.com/watch?v=${videoId}`;
  if (!candidates.includes(canonicalUrl)) candidates.push(canonicalUrl);

  // Với Mix, mọi biến thể làm mất `list` sẽ biến playlist động thành một video đơn rồi
  // để autoplay tự nối bài — đúng triệu chứng "queue toàn nhạc cùng tác giả". Dừng ở đây.
  if (listId?.toUpperCase().startsWith("RD")) return candidates;

  const shortUrl = `https://youtu.be/${videoId}`;
  if (!candidates.includes(shortUrl)) candidates.push(shortUrl);
  // NOTE: bare video ID intentionally NOT added — treated as text search → wrong song

  return candidates;
}

/**
 * Ảnh thumbnail suy ra từ video ID.
 *
 * Track lấy từ playlist/Mix feed nhiều khi không có `thumbnail`, khi đó embed sẽ
 * trống trơn không ảnh. URL i.ytimg.com là tất định theo video ID nên lấy được
 * ngay, không tốn request nào.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://youtu.be/${encodeURIComponent(videoId)}&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}
