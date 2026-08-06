import { PlaylistError } from "../types/playlist.js";
import { parseSpotifyUrl, type ParsedSpotifyUrl } from "../utils/spotify.js";

/**
 * Spotify Web API — chỉ lấy metadata.
 *
 * Spotify KHÔNG cho stream audio qua API (Web Playback SDK bắt buộc trình duyệt
 * và tài khoản Premium), nên bot dùng Spotify làm nguồn dữ liệu sạch — tên bài,
 * ca sĩ, thời lượng, ảnh bìa — rồi khớp sang YouTube để phát.
 *
 * Dùng luồng Client Credentials: không cần người dùng đăng nhập, chỉ đọc được dữ
 * liệu công khai. Vì vậy playlist riêng tư và "Liked Songs" sẽ không đọc được.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

/** Trần số bài lấy về, chặn album/playlist khổng lồ làm treo bot. */
const MAX_TRACKS = 200;
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 15_000;

export interface SpotifyTrack {
  id: string;
  title: string;
  artists: string[];
  durationMs?: number;
  thumbnail?: string;
  url: string;
}

export interface SpotifyResult {
  kind: ParsedSpotifyUrl["kind"];
  name?: string;
  tracks: SpotifyTrack[];
}

export function isSpotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function market(): string {
  return process.env.SPOTIFY_MARKET || "VN";
}

// ─── Token ────────────────────────────────────────────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Access token, có nhớ đệm.
 *
 * Token sống 1 giờ; trừ hao 60 giây để không dùng phải token vừa hết hạn giữa
 * chừng một chuỗi request phân trang.
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new PlaylistError("SPOTIFY_NOT_CONFIGURED");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.error(`[spotify] lấy token thất bại: HTTP ${res.status}`);
    throw new PlaylistError("SPOTIFY_AUTH_FAILED");
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new PlaylistError("SPOTIFY_AUTH_FAILED");

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  console.log("[spotify] đã lấy access token mới");
  return cachedToken.value;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 401) {
    // Token bị thu hồi sớm — bỏ nhớ đệm rồi thử lại đúng một lần.
    cachedToken = null;
    const retry = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!retry.ok) throw httpError(retry.status);
    return retry.json() as Promise<T>;
  }

  if (!res.ok) throw httpError(res.status);
  return res.json() as Promise<T>;
}

function httpError(status: number): PlaylistError {
  console.warn(`[spotify] HTTP ${status}`);
  if (status === 404) return new PlaylistError("PLAYLIST_NOT_FOUND");
  if (status === 403) return new PlaylistError("PLAYLIST_PRIVATE");
  if (status === 429) return new PlaylistError("RATE_LIMITED");
  return new PlaylistError("PLAYLIST_FETCH_FAILED");
}

// ─── Hình dạng dữ liệu trả về ────────────────────────────────────────────────
interface RawImage {
  url?: string;
}
interface RawArtist {
  name?: string;
}
interface RawTrack {
  id?: string | null;
  name?: string;
  duration_ms?: number;
  artists?: RawArtist[];
  album?: { images?: RawImage[] };
  is_local?: boolean;
  type?: string;
}
interface RawPage<T> {
  items?: T[];
  next?: string | null;
}

function toTrack(raw: RawTrack, fallbackArt?: string): SpotifyTrack | null {
  // Bài local của người dùng không có id và không tra được ở đâu cả.
  if (!raw?.id || raw.is_local) return null;
  // Playlist có thể chứa podcast episode — không phải nhạc, bỏ.
  if (raw.type && raw.type !== "track") return null;

  const artists = (raw.artists ?? []).map((a) => a.name).filter((n): n is string => Boolean(n));

  return {
    id: raw.id,
    title: raw.name ?? "Không rõ tên",
    artists,
    ...(raw.duration_ms ? { durationMs: raw.duration_ms } : {}),
    ...(raw.album?.images?.[0]?.url ?? fallbackArt
      ? { thumbnail: raw.album?.images?.[0]?.url ?? fallbackArt }
      : {}),
    url: `https://open.spotify.com/track/${raw.id}`,
  };
}

/** Lặp phân trang cho tới hết hoặc chạm trần. */
async function pageThrough<T>(
  firstPath: string,
  map: (item: T) => SpotifyTrack | null,
): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let offset = 0;

  while (out.length < MAX_TRACKS) {
    const sep = firstPath.includes("?") ? "&" : "?";
    const page = await api<RawPage<T>>(`${firstPath}${sep}limit=${PAGE_SIZE}&offset=${offset}`);
    const items = page.items ?? [];
    if (!items.length) break;

    for (const item of items) {
      const track = map(item);
      if (track) out.push(track);
      if (out.length >= MAX_TRACKS) break;
    }

    if (!page.next) break;
    offset += PAGE_SIZE;
  }

  return out;
}

// ─── Điểm vào ─────────────────────────────────────────────────────────────────
/** Đọc một URL Spotify thành danh sách bài. */
export async function fetchSpotify(url: string): Promise<SpotifyResult> {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) throw new PlaylistError("INVALID_URL");
  if (!isSpotifyConfigured()) throw new PlaylistError("SPOTIFY_NOT_CONFIGURED");

  const m = market();

  if (parsed.kind === "track") {
    const raw = await api<RawTrack>(`/tracks/${parsed.id}?market=${m}`);
    const track = toTrack(raw);
    if (!track) throw new PlaylistError("PLAYLIST_NOT_FOUND");
    return { kind: "track", tracks: [track] };
  }

  if (parsed.kind === "album") {
    // Track trong /albums/{id}/tracks KHÔNG kèm object album, nên phải lấy ảnh
    // bìa từ chính album rồi gán xuống từng bài.
    const album = await api<{ name?: string; images?: RawImage[] }>(
      `/albums/${parsed.id}?market=${m}`,
    );
    const art = album.images?.[0]?.url;
    const tracks = await pageThrough<RawTrack>(`/albums/${parsed.id}/tracks?market=${m}`, (t) =>
      toTrack(t, art),
    );
    return { kind: "album", name: album.name, tracks };
  }

  // ── Playlist ───────────────────────────────────────────────────────────────
  // ĐÃ KIỂM CHỨNG 06/08/2026: với Client Credentials, Spotify KHÔNG trả nội dung
  // playlist nữa. `/playlists/{id}` phản hồi 200 nhưng không còn trường `tracks`,
  // còn `/playlists/{id}/tracks` trả 403 cho MỌI playlist — cả playlist biên tập
  // (37i9dQZ...) lẫn playlist do người dùng thường tạo.
  //
  // Đọc được nội dung playlist đòi hỏi Authorization Code flow, tức là phải có
  // người dùng đăng nhập Spotify và một redirect URI — vượt ngoài phạm vi bot này.
  //
  // Vẫn thử gọi API: nếu Spotify mở lại thì đường này tự chạy, không phải sửa gì.
  try {
    const playlist = await api<{ name?: string }>(
      `/playlists/${parsed.id}?market=${m}&fields=name`,
    );
    const tracks = await pageThrough<{ track?: RawTrack | null }>(
      `/playlists/${parsed.id}/tracks?market=${m}`,
      (item) => (item.track ? toTrack(item.track) : null),
    );
    if (!tracks.length) throw new PlaylistError("SPOTIFY_PLAYLIST_BLOCKED");
    return { kind: "playlist", name: playlist.name, tracks };
  } catch (err) {
    const code = err instanceof PlaylistError ? err.code : null;
    if (code === "PLAYLIST_PRIVATE" || code === "PLAYLIST_NOT_FOUND") {
      throw new PlaylistError("SPOTIFY_PLAYLIST_BLOCKED");
    }
    throw err;
  }
}
