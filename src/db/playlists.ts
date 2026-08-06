import { ObjectId, type Collection, type WithId } from "mongodb";
import { getDb } from "./mongo.js";
import { PlaylistError } from "../types/playlist.js";
import type { ImportedTrack, PlaylistDocument, SavedTrack } from "../types/playlist.js";
import { removeVietnameseTones } from "../utils/viFont.js";
import { canManagePlaylist } from "../utils/owners.js";
import { trackKey } from "../utils/trackKey.js";
import { blockTracks, blockedKeys } from "./blocklist.js";
import { deleteObject } from "../services/r2.js";

/** Trần số bài một playlist, tránh document Mongo phình quá 16MB. */
function maxTracks(): number {
  const raw = Number(process.env.PLAYLIST_MAX_TRACKS);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

function collection(): Collection<PlaylistDocument> {
  return getDb().collection<PlaylistDocument>("playlists");
}

/**
 * Chuẩn hóa tên để so sánh.
 *
 * Bỏ dấu tiếng Việt nữa, để "Nhạc Chill" và "nhac chill" là một — người dùng gõ
 * lại tên playlist hiếm khi bỏ dấu giống hệt lần đầu.
 */
export function normalizeName(name: string): string {
  return removeVietnameseTones(name).toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  updatedAt: Date;
}

export async function listPlaylists(ownerId: string, guildId: string): Promise<PlaylistSummary[]> {
  const docs = await collection()
    .find({ ownerId, guildId }, { projection: { name: 1, tracks: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(25) // Đúng trần option của select menu Discord.
    .toArray();

  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    trackCount: d.tracks?.length ?? 0,
    updatedAt: d.updatedAt,
  }));
}

// WithId chứ không phải PlaylistDocument trần: chỗ gọi cần `_id` để dựng customId
// và để biết playlist nào vừa tìm được.
export async function findPlaylistById(id: string): Promise<WithId<PlaylistDocument> | null> {
  if (!ObjectId.isValid(id)) return null;
  return collection().findOne({ _id: new ObjectId(id) } as object);
}

/** Tìm theo tên, không phân biệt hoa thường và dấu. */
export async function findPlaylistByName(
  ownerId: string,
  guildId: string,
  name: string,
): Promise<WithId<PlaylistDocument> | null> {
  return collection().findOne({ ownerId, guildId, normalizedName: normalizeName(name) });
}

export async function createPlaylist(
  ownerId: string,
  guildId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new PlaylistError("INVALID_URL", "Tên playlist trống");

  const now = new Date();
  try {
    const res = await collection().insertOne({
      ownerId,
      guildId,
      name: trimmed,
      normalizedName: normalizeName(trimmed),
      tracks: [],
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    } as PlaylistDocument);
    return String(res.insertedId);
  } catch (err) {
    // 11000 = trùng unique index (ownerId, guildId, normalizedName).
    if ((err as { code?: number }).code === 11000) throw new PlaylistError("PLAYLIST_EXISTS");
    throw err;
  }
}

export async function deletePlaylist(id: string, requesterId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const playlist = await findPlaylistById(id);
  if (!playlist || !canManagePlaylist(requesterId, playlist.ownerId)) return false;

  // Dọn luôn file trên R2, nếu không sẽ trả tiền lưu trữ cho nhạc không ai truy cập.
  for (const track of playlist.tracks) {
    if (track.r2Key) await deleteObject(track.r2Key);
  }

  const res = await collection().deleteOne({ _id: new ObjectId(id) } as object);
  return res.deletedCount === 1;
}

/** Thêm một file đã upload lên R2 vào playlist. */
export async function addUploadedTrack(
  playlistId: string,
  requesterId: string,
  track: Omit<SavedTrack, "position" | "addedAt">,
): Promise<void> {
  const playlist = await findPlaylistById(playlistId);
  if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");
  if (!canManagePlaylist(requesterId, playlist.ownerId)) throw new PlaylistError("NOT_ALLOWED");
  if (playlist.tracks.length >= maxTracks()) throw new PlaylistError("PLAYLIST_FULL");

  await collection().updateOne({ _id: new ObjectId(playlistId) } as object, {
    $push: { tracks: { ...track, position: playlist.tracks.length, addedAt: new Date() } },
    $set: { updatedAt: new Date() },
  });
}

/**
 * Xóa một bài khỏi playlist theo vị trí.
 *
 * Đánh lại `position` cho toàn bộ bài còn lại để chỉ số luôn liên tục — UI phân
 * trang và lệnh phát đều dựa vào đó.
 */
export async function removeTrackAt(
  playlistId: string,
  requesterId: string,
  position: number,
): Promise<SavedTrack | null> {
  const playlist = await findPlaylistById(playlistId);
  if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");
  if (!canManagePlaylist(requesterId, playlist.ownerId)) throw new PlaylistError("NOT_ALLOWED");

  const ordered = [...playlist.tracks].sort((a, b) => a.position - b.position);
  const removed = ordered[position];
  if (!removed) return null;

  const remaining = ordered
    .filter((_, i) => i !== position)
    .map((t, i) => ({ ...t, position: i }));

  await collection().updateOne({ _id: new ObjectId(playlistId) } as object, {
    $set: { tracks: remaining, updatedAt: new Date() },
  });

  // Loại bỏ một bài = "không muốn nghe bài này nữa", nên ghi vào danh sách chặn
  // để lần import Mix sau nó không bò lại vào.
  await blockTracks(playlist.ownerId, playlist.guildId, [removed]);

  // Xóa file trên R2 sau khi Mongo đã cập nhật: nếu làm ngược, ghi Mongo lỗi thì
  // playlist còn trỏ tới một file không còn tồn tại.
  if (removed.r2Key) await deleteObject(removed.r2Key);

  return removed;
}

export interface AddTracksResult {
  added: number;
  duplicatesSkipped: number;
  /** Bị bỏ vì nằm trong danh sách chặn. */
  blockedSkipped: number;
  rejected: number;
}

/**
 * Thêm các bài đã chọn vào playlist.
 *
 * Chống trùng theo `source + externalId` so với các bài ĐÃ có trong playlist và
 * cả trong chính lô đang thêm — một Mix có thể lặp lại cùng một video.
 * `position` được đánh liên tục nối tiếp bài cuối cùng.
 */
export async function addTracks(
  playlistId: string,
  requesterId: string,
  tracks: ImportedTrack[],
  addedBy: string,
): Promise<AddTracksResult> {
  const playlist = await findPlaylistById(playlistId);
  if (!playlist) throw new PlaylistError("PLAYLIST_NOT_FOUND");
  if (!canManagePlaylist(requesterId, playlist.ownerId)) throw new PlaylistError("NOT_ALLOWED");

  // Chặn theo trackKey chứ không phải source+externalId: cùng một video thêm qua
  // youtu.be/ID và watch?v=ID có externalId khác nhau nhưng vẫn là một bài.
  const seen = new Set(playlist.tracks.map((t) => trackKey(t)));
  const blocked = await blockedKeys(playlist.ownerId, playlist.guildId);
  const limit = maxTracks();
  const now = new Date();

  let position = playlist.tracks.length;
  let duplicatesSkipped = 0;
  let blockedSkipped = 0;
  let rejected = 0;
  const toAdd: SavedTrack[] = [];

  for (const track of tracks) {
    const key = trackKey(track);
    if (blocked.has(key)) {
      blockedSkipped++;
      continue;
    }
    if (seen.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    if (position + toAdd.length >= limit) {
      rejected++;
      continue;
    }
    seen.add(key);
    toAdd.push({
      position: position + toAdd.length,
      source: track.source,
      externalId: track.externalId,
      url: track.url,
      title: track.title,
      ...(track.author ? { author: track.author } : {}),
      ...(track.durationMs != null ? { durationMs: track.durationMs } : {}),
      ...(track.thumbnail ? { thumbnail: track.thumbnail } : {}),
      addedBy,
      addedAt: now,
    });
  }

  if (toAdd.length) {
    await collection().updateOne({ _id: new ObjectId(playlistId) } as object, {
      $push: { tracks: { $each: toAdd } },
      $set: { updatedAt: now },
    });
  }

  return { added: toAdd.length, duplicatesSkipped, blockedSkipped, rejected };
}
