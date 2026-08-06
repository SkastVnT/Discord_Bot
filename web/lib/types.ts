/**
 * Kiểu dữ liệu playlist, dùng chung với bot.
 *
 * TRÙNG LẶP CÓ CHỦ Ý: source của bot dùng quy ước import `./x.js` của
 * moduleResolution Node16, webpack của Next không map ngược `.js` → `.ts` nên
 * không import thẳng `../src/types/playlist.ts` được.
 *
 * Đổi shape ở src/types/playlist.ts thì phải sửa cả file này.
 */

export type TrackSource = "youtube" | "spotify" | "soundcloud" | "upload";

export interface SavedTrack {
  position: number;
  source: TrackSource;
  externalId: string;
  url: string;
  title: string;
  author?: string;
  durationMs?: number;
  thumbnail?: string;
  addedBy: string;
  addedAt: Date;
  r2Key?: string;
  fileBytes?: number;
}

export interface PlaylistDocument {
  _id: string;
  ownerId: string;
  guildId: string;
  name: string;
  normalizedName: string;
  description?: string;
  tracks: SavedTrack[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Object trong bucket R2, ghép thêm thông tin bài hát đang dùng nó (nếu có). */
export interface StorageObject {
  key: string;
  size: number;
  lastModified?: Date;
  url: string;
  /** Không playlist nào trỏ tới object này — chỉ tốn tiền lưu trữ. */
  orphan: boolean;
  usedBy?: { playlistId: string; playlistName: string; title: string };
}

/**
 * Khoá so trùng của một bài.
 *
 * So bằng URL đã chuẩn hoá chứ không bằng tiêu đề: cùng một video có thể được
 * thêm vào dưới nhiều dạng link (`youtu.be/ID`, `watch?v=ID&list=...`,
 * `music.youtube.com/...`) nên chuỗi URL thô không so trực tiếp được.
 * Với YouTube thì rút về video ID; nguồn khác thì bỏ query và dấu / cuối.
 */
export function dupeKey(track: Pick<SavedTrack, "url" | "source" | "externalId">): string {
  try {
    const url = new URL(track.url);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id) return `yt:${id}`;
    }
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return `yt:${v}`;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "embed") && parts[1]) return `yt:${parts[1]}`;
    }

    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return `${track.source}:${track.externalId}`;
  }
}

/** Đánh dấu các bài là bản trùng (lần xuất hiện thứ 2 trở đi). */
export function findDuplicates(tracks: SavedTrack[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  tracks.forEach((t, i) => {
    const key = dupeKey(t);
    if (seen.has(key)) dupes.add(i);
    else seen.add(key);
  });
  return dupes;
}

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
