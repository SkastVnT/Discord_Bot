/** Remove Vietnamese diacritics */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Truncate string to max length */
export function ViFonttrim(str: string, max = 2000): string {
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

/** Convert milliseconds to a Discord relative timestamp */
export function msToTime(ms: number): string {
  const time = Math.floor((Date.now() + ms) / 1000);
  return `<t:${time}:R>`;
}

/** Check if a string is a valid HTTP/HTTPS URL */
export function validURL(str: string): boolean {
  const regex = /^(https?:\/\/[^\s]+)$/i;
  return regex.test(str);
}

/** Fisher-Yates shuffle */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]] as [T, T];
  }
  return array;
}

/** Strip Zi= query param from a URL/query string */
export function ViFontcrop(query: string): string {
  if (query.includes("Zi=")) {
    const parts = query.split("Zi=");
    parts.shift();
    return parts.join("");
  }
  return query;
}

/** Extract the clean song title from a YouTube-style video title */
export function extractSongTitle(title: string, artist = ""): string {
  const normalizedArtist = artist.toLowerCase().trim() || "a";
  const segments = title.split(/-|\||\[|\]|\(|\)| ft/i);

  for (const segment of segments) {
    const trimmed = segment.trim().toLowerCase();
    if (
      trimmed &&
      !trimmed.includes("music") &&
      !trimmed.includes("lyrics") &&
      !trimmed.includes(normalizedArtist)
    ) {
      return segment.trim();
    }
  }
  return title;
}
