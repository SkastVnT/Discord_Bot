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

// ─── Nhận diện video tổng hợp ─────────────────────────────────────────────────
// Feed của YouTube Mix (watch_next_feed) với nhạc Việt bị các kênh tổng hợp chiếm
// gần hết: playlist 1 tiếng, "full album", "TOP 20", bài loop 1 hour... Đưa hết vào
// queue thì queue thành một đống playlist thay vì từng bài hát.

const COMPILATION_PATTERNS = [
  /\bplaylist\b/i,
  /tuy[ểe]n t[ậa]p|t[ổo]ng h[ợo]p/i,
  /full album|\balbum\b/i,
  /\bmix\b/i, // "Remix" không khớp vì không có ranh giới từ trước "mix"
  /\btop\s*\d+/i,
  /nh[ạa]c\s+(chill|lofi|bu[ồo]n|tr[ẻe]|vi[ệe]t)/i,
  /\d+\s*(b[àa]i|b[ảa]n)\s*nh[ạa]c/i,
  /nh[ữu]ng\s+(ca kh[úu]c|b[àa]i|b[ảa]n)/i,
  /\d+\s*hour|\bhour\b/i,
  /\bloop\b/i,
  /\bmashup\b/i,
];

/**
 * Bỏ phần không phải tên bài trước khi đếm dấu phân cách.
 *
 * Danh sách nghệ sĩ khách mời cũng dùng dấu phẩy — "W/n - SSD ft. (267, Nguyenn,
 * PAR SG)" có 2 dấu phẩy nhưng là một bài hát. Nếu đếm thẳng thì bài đó bị bỏ oan.
 */
function stripFeatures(title: string): string {
  return title
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(ft|feat|prod)\b\.?.*$/i, "");
}

/**
 * Title trông như video tổng hợp nhiều bài chứ không phải một bài hát.
 *
 * Chỉ dựa vào title vì track lấy từ feed không có duration (là NaN) nên không lọc
 * được theo độ dài. Cố ý thiên về giữ lại: thà lọt một playlist còn hơn bỏ oan bài hát.
 */
export function looksLikeCompilation(title: string): boolean {
  if (!title) return false;
  if (COMPILATION_PATTERNS.some((re) => re.test(title))) return true;

  const core = stripFeatures(title);
  const xCount = (core.match(/\s+x\s+/gi) ?? []).length;
  const commas = (core.match(/,/g) ?? []).length;
  return xCount >= 2 || commas >= 2;
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
