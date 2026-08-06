import type { Collection } from "mongodb";
import { getDb } from "./mongo.js";
import { trackKey } from "../utils/trackKey.js";
import type { SavedTrack, ImportedTrack } from "../types/playlist.js";

/**
 * Danh sách chặn — những bài đã bị loại bỏ thì không được thêm lại.
 *
 * VÌ SAO CẦN: cách dùng thường gặp là dán link Mix (`list=RD...`), mỗi lần dán
 * lại YouTube trả về gần như cùng một rổ bài. Bỏ tay những bài không thích xong,
 * lần sau dán Mix khác thì chúng lại bò vào. Ghi nhớ lựa chọn "không thích" khiến
 * mỗi bài chỉ phải loại đúng một lần.
 *
 * Phạm vi (ownerId, guildId) — giống playlist. Chặn là ý thích cá nhân, không
 * gắn với một playlist cụ thể.
 */

export interface BlockedTrackDocument {
  ownerId: string;
  guildId: string;
  /** trackKey() — `yt:<videoId>` với YouTube. */
  key: string;
  title: string;
  url: string;
  author?: string;
  blockedAt: Date;
}

function collection(): Collection<BlockedTrackDocument> {
  return getDb().collection<BlockedTrackDocument>("playlist_blocklist");
}

/**
 * Chặn các bài vừa bị loại bỏ.
 *
 * Dùng upsert nên chặn lại bài đã chặn không lỗi. Không ném ra ngoài: chặn hụt
 * chỉ khiến bài đó có thể quay lại, không được phép làm hỏng thao tác xóa.
 */
export async function blockTracks(
  ownerId: string,
  guildId: string,
  tracks: Array<Pick<SavedTrack, "url" | "title" | "source" | "externalId"> & { author?: string }>,
): Promise<number> {
  if (!tracks.length) return 0;

  try {
    const now = new Date();
    const ops = tracks.map((t) => ({
      updateOne: {
        filter: { ownerId, guildId, key: trackKey(t) },
        update: {
          $set: { title: t.title, url: t.url, ...(t.author ? { author: t.author } : {}) },
          $setOnInsert: { ownerId, guildId, key: trackKey(t), blockedAt: now },
        },
        upsert: true,
      },
    }));
    const res = await collection().bulkWrite(ops);
    const added = res.upsertedCount;
    if (added) console.log(`[blocklist] chặn thêm ${added} bài cho ${ownerId}`);
    return added;
  } catch (err) {
    console.warn(`[blocklist] không ghi được: ${(err as Error).message}`);
    return 0;
  }
}

/** Các khoá đang bị chặn, để lọc một lô bài trong đúng một truy vấn. */
export async function blockedKeys(ownerId: string, guildId: string): Promise<Set<string>> {
  try {
    const docs = await collection()
      .find({ ownerId, guildId }, { projection: { key: 1 } })
      .toArray();
    return new Set(docs.map((d) => d.key));
  } catch (err) {
    // Không đọc được thì thà cho qua còn hơn chặn nhầm toàn bộ.
    console.warn(`[blocklist] không đọc được: ${(err as Error).message}`);
    return new Set();
  }
}

/** Bỏ các bài đang bị chặn khỏi một danh sách import. */
export async function filterBlocked<T extends { url: string }>(
  ownerId: string,
  guildId: string,
  tracks: T[],
): Promise<{ tracks: T[]; blockedCount: number }> {
  const blocked = await blockedKeys(ownerId, guildId);
  if (!blocked.size) return { tracks, blockedCount: 0 };

  const kept = tracks.filter((t) => !blocked.has(trackKey(t)));
  const blockedCount = tracks.length - kept.length;
  if (blockedCount) console.log(`[blocklist] lọc bỏ ${blockedCount}/${tracks.length} bài đã chặn`);
  return { tracks: kept, blockedCount };
}

export async function listBlocked(
  ownerId: string,
  guildId: string,
  limit = 100,
): Promise<BlockedTrackDocument[]> {
  return collection().find({ ownerId, guildId }).sort({ blockedAt: -1 }).limit(limit).toArray();
}

export async function countBlocked(ownerId: string, guildId: string): Promise<number> {
  return collection().countDocuments({ ownerId, guildId });
}

/** Gỡ chặn theo khoá. Trả về bài vừa gỡ, hoặc null nếu vốn không bị chặn. */
export async function unblockByKey(
  ownerId: string,
  guildId: string,
  key: string,
): Promise<BlockedTrackDocument | null> {
  const doc = await collection().findOneAndDelete({ ownerId, guildId, key });
  if (doc) console.log(`[blocklist] gỡ chặn ${key} (${doc.title})`);
  return doc ?? null;
}

export async function clearBlocklist(ownerId: string, guildId: string): Promise<number> {
  const res = await collection().deleteMany({ ownerId, guildId });
  return res.deletedCount;
}

/** Bỏ các bài đã chặn khỏi một lô ImportedTrack và đánh lại importIndex. */
export async function filterBlockedImported(
  ownerId: string,
  guildId: string,
  tracks: ImportedTrack[],
): Promise<{ tracks: ImportedTrack[]; blockedCount: number }> {
  const result = await filterBlocked(ownerId, guildId, tracks);
  result.tracks.forEach((t, i) => (t.importIndex = i));
  return result;
}
