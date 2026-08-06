/**
 * Kiểu dữ liệu cho tính năng playlist.
 *
 * Tách riêng khỏi types/command.ts vì tầng db, service và UI đều dùng chung;
 * để trong một file lẻ thì ba tầng đó không phải import chéo nhau.
 */

/** Nguồn nhạc. "upload" là file người dùng tự tải lên, lưu trên Cloudflare R2. */
export type TrackSource = "youtube" | "spotify" | "soundcloud" | "upload";

/** Loại URL YouTube mà parseYouTubeUrl() nhận ra. */
export type YouTubeUrlKind = "video" | "playlist" | "video_in_playlist" | "mix";

export interface ParsedYouTubeUrl {
  kind: YouTubeUrlKind;
  /** URL đã chuẩn hóa để đưa cho plugin đi tìm. */
  canonicalUrl: string;
  videoId?: string;
  listId?: string;
}

/**
 * Một bài trong kết quả preview, chưa lưu xuống database.
 *
 * `importIndex` là vị trí trong danh sách preview và là thứ DUY NHẤT mà UI gửi
 * ngược lên server — metadata luôn lấy lại từ session, không tin client.
 */
export interface ImportedTrack {
  importIndex: number;
  source: TrackSource;
  externalId: string;
  url: string;
  title: string;
  author?: string;
  durationMs?: number;
  thumbnail?: string;
}

export interface PlaylistImportResult {
  source: {
    provider: TrackSource;
    kind: YouTubeUrlKind;
    sourceUrl: string;
    videoId?: string;
    listId?: string;
    title?: string;
  };
  tracks: ImportedTrack[];
  /** Số video tổng hợp đã lọc bỏ, để nói rõ với người dùng thay vì âm thầm cắt. */
  droppedCount: number;
}

/** Một bài đã lưu trong playlist. */
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
  /** Chỉ có với source "upload": key của object trên R2, cần để xóa file khi xóa bài. */
  r2Key?: string;
  /** Chỉ có với source "upload": dung lượng file. */
  fileBytes?: number;
}

export interface PlaylistDocument {
  ownerId: string;
  guildId: string;
  name: string;
  /** name đã lowercase + bỏ dấu, dùng cho unique index và tìm không phân biệt hoa thường. */
  normalizedName: string;
  description?: string;
  tracks: SavedTrack[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistImportSessionDocument {
  sessionId: string;
  userId: string;
  guildId: string;
  targetPlaylistId?: string;
  sourceUrl: string;
  sourceTitle?: string;
  tracks: ImportedTrack[];
  /** Các importIndex đang được tick. Lưu server-side vì select menu của Discord không nhớ. */
  selectedIndexes: number[];
  page: number;
  createdAt: Date;
  expiresAt: Date;
}

/** Mã lỗi trả về từ tầng import — chỗ gọi map sang câu tiếng Việt. */
export type PlaylistErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROVIDER"
  | "PLAYLIST_NOT_FOUND"
  | "PLAYLIST_PRIVATE"
  | "PLAYLIST_FETCH_TIMEOUT"
  | "PLAYLIST_FETCH_FAILED"
  | "IMPORT_SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "PLAYLIST_EXISTS"
  | "PLAYLIST_FULL"
  | "SPOTIFY_NOT_CONFIGURED"
  | "SPOTIFY_AUTH_FAILED"
  | "SPOTIFY_NO_MATCH"
  | "SPOTIFY_PLAYLIST_BLOCKED"
  | "R2_NOT_CONFIGURED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_FAILED"
  | "NOT_ALLOWED";

export class PlaylistError extends Error {
  constructor(public readonly code: PlaylistErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PlaylistError";
  }
}
