import type { Collection } from "mongodb";
import { getDb } from "./db";
import { dupeKey } from "./types";
import type { SavedTrack } from "./types";

/**
 * Danh sách chặn — cùng collection mà bot dùng.
 *
 * Bỏ một bài khỏi playlist nghĩa là "không muốn nghe bài này nữa", nên lần import
 * Mix sau nó phải bị lọc ra. Phạm vi (ownerId, guildId), giống playlist.
 */

export interface BlockedTrackDocument {
  ownerId: string;
  guildId: string;
  key: string;
  title: string;
  url: string;
  author?: string;
  blockedAt: Date;
}

async function collection(): Promise<Collection<BlockedTrackDocument>> {
  return (await getDb()).collection<BlockedTrackDocument>("playlist_blocklist");
}

export async function blockTracks(
  ownerId: string,
  guildId: string,
  tracks: SavedTrack[],
): Promise<number> {
  if (!tracks.length) return 0;
  const col = await collection();
  const now = new Date();

  const res = await col.bulkWrite(
    tracks.map((t) => ({
      updateOne: {
        filter: { ownerId, guildId, key: dupeKey(t) },
        update: {
          $set: { title: t.title, url: t.url, ...(t.author ? { author: t.author } : {}) },
          $setOnInsert: { ownerId, guildId, key: dupeKey(t), blockedAt: now },
        },
        upsert: true,
      },
    })),
  );
  return res.upsertedCount;
}

export async function blockedKeys(ownerId: string, guildId: string): Promise<Set<string>> {
  const col = await collection();
  const docs = await col.find({ ownerId, guildId }, { projection: { key: 1 } }).toArray();
  return new Set(docs.map((d) => d.key));
}

/** Toàn bộ danh sách chặn của mọi owner/guild — công cụ dev nên xem hết. */
export async function listAllBlocked(): Promise<BlockedTrackDocument[]> {
  const col = await collection();
  return col.find({}).sort({ blockedAt: -1 }).limit(500).toArray();
}

export async function unblock(ownerId: string, guildId: string, key: string): Promise<boolean> {
  const col = await collection();
  const res = await col.deleteOne({ ownerId, guildId, key });
  return res.deletedCount === 1;
}

export async function clearAllBlocked(ownerId: string, guildId: string): Promise<number> {
  const col = await collection();
  const res = await col.deleteMany({ ownerId, guildId });
  return res.deletedCount;
}
