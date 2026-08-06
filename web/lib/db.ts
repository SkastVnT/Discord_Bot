import { MongoClient, ObjectId, type Collection, type Db } from "mongodb";
import { existsSync } from "fs";
import { dupeKey } from "./types";
import { blockedKeys } from "./blocklist";
import type { PlaylistDocument, SavedTrack } from "./types";

/**
 * Kết nối MongoDB cho công cụ dev.
 *
 * Giữ client trong globalThis vì Next dev server hot-reload module liên tục;
 * không cache thì mỗi lần sửa file lại mở thêm một connection pool cho tới khi
 * Atlas từ chối vì quá số kết nối.
 */

const globalForMongo = globalThis as unknown as { _mongo?: Promise<Db> };

function connect(): Promise<Db> {
  const dbName = process.env.MONGODB_DB_NAME ?? "discord_bot";
  const x509Enabled = process.env.MONGODB_X509_ENABLED === "true";
  const certPath = process.env.MONGODB_X509_CERT_PATH;

  const useX509 = x509Enabled && certPath && existsSync(certPath) && process.env.MONGODB_X509_URI;
  const uri = useX509 ? process.env.MONGODB_X509_URI! : process.env.MONGODB_URI!;

  if (!uri) throw new Error("Thiếu MONGODB_URI trong web/.env.local");

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 5,
    ...(useX509 ? { tlsCertificateKeyFile: certPath } : {}),
    tlsAllowInvalidCertificates:
      process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES === "true",
  });

  return client.connect().then((c) => c.db(dbName));
}

export function getDb(): Promise<Db> {
  if (!globalForMongo._mongo) globalForMongo._mongo = connect();
  return globalForMongo._mongo;
}

async function playlists(): Promise<Collection<PlaylistDocument>> {
  return (await getDb()).collection<PlaylistDocument>("playlists");
}

/** Bỏ dấu tiếng Việt + lowercase. Phải khớp normalizeName() của bot. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mongo trả ObjectId; các component React cần chuỗi để đưa vào href và form. */
function serialize(doc: PlaylistDocument): PlaylistDocument {
  return { ...doc, _id: String(doc._id) };
}

export async function listAllPlaylists(): Promise<PlaylistDocument[]> {
  const col = await playlists();
  const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
  return docs.map((d) => serialize(d as unknown as PlaylistDocument));
}

export async function getPlaylist(id: string): Promise<PlaylistDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await playlists();
  const doc = await col.findOne({ _id: new ObjectId(id) } as object);
  return doc ? serialize(doc as unknown as PlaylistDocument) : null;
}

export async function createPlaylist(
  ownerId: string,
  guildId: string,
  name: string,
): Promise<string> {
  const col = await playlists();
  const now = new Date();
  const res = await col.insertOne({
    ownerId,
    guildId,
    name: name.trim().slice(0, 80),
    normalizedName: normalizeName(name),
    tracks: [],
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  } as unknown as PlaylistDocument);
  return String(res.insertedId);
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const col = await playlists();
  await col.updateOne({ _id: new ObjectId(id) } as object, {
    $set: {
      name: name.trim().slice(0, 80),
      normalizedName: normalizeName(name),
      updatedAt: new Date(),
    },
  });
}

/** Trả về các r2Key cần dọn — chỗ gọi tự quyết định xóa trên R2 hay không. */
export async function deletePlaylist(id: string): Promise<string[]> {
  const playlist = await getPlaylist(id);
  if (!playlist) return [];
  const col = await playlists();
  await col.deleteOne({ _id: new ObjectId(id) } as object);
  return playlist.tracks.map((t) => t.r2Key).filter((k): k is string => Boolean(k));
}

/** Ghi lại toàn bộ mảng track và đánh lại position cho liên tục. */
async function writeTracks(id: string, tracks: SavedTrack[]): Promise<void> {
  const col = await playlists();
  await col.updateOne({ _id: new ObjectId(id) } as object, {
    $set: {
      tracks: tracks.map((t, i) => ({ ...t, position: i })),
      updatedAt: new Date(),
    },
  });
}

function ordered(playlist: PlaylistDocument): SavedTrack[] {
  return [...playlist.tracks].sort((a, b) => a.position - b.position);
}

export async function removeTrack(id: string, position: number): Promise<SavedTrack | null> {
  const playlist = await getPlaylist(id);
  if (!playlist) return null;
  const list = ordered(playlist);
  const removed = list[position];
  if (!removed) return null;
  await writeTracks(
    id,
    list.filter((_, i) => i !== position),
  );
  return removed;
}

/**
 * Xoá nhiều bài cùng lúc theo vị trí.
 *
 * Trả về các bài đã xoá; chỗ gọi tự quyết định dọn file R2 nào.
 */
export async function removeTracksAt(id: string, positions: number[]): Promise<SavedTrack[]> {
  const playlist = await getPlaylist(id);
  if (!playlist) return [];
  const drop = new Set(positions);
  const list = ordered(playlist);
  const removed = list.filter((_, i) => drop.has(i));
  if (!removed.length) return [];
  await writeTracks(
    id,
    list.filter((_, i) => !drop.has(i)),
  );
  return removed;
}

/**
 * Gộp các bài trùng URL, giữ lại bản xuất hiện đầu tiên.
 *
 * KHÔNG xoá file trên R2: hai bản trùng dùng chung một `r2Key`, xoá object đi thì
 * bản được giữ lại cũng chết theo.
 */
export async function dedupeByUrl(id: string): Promise<number> {
  const playlist = await getPlaylist(id);
  if (!playlist) return 0;

  const list = ordered(playlist);
  const seen = new Set<string>();
  const kept = list.filter((t) => {
    const key = dupeKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const removed = list.length - kept.length;
  if (removed > 0) await writeTracks(id, kept);
  return removed;
}

/** Đổi chỗ một bài với bài liền kề. `delta` là -1 (lên) hoặc +1 (xuống). */
export async function moveTrack(id: string, position: number, delta: number): Promise<void> {
  const playlist = await getPlaylist(id);
  if (!playlist) return;
  const list = ordered(playlist);
  const target = position + delta;
  if (target < 0 || target >= list.length || !list[position]) return;
  [list[position], list[target]] = [list[target]!, list[position]!];
  await writeTracks(id, list);
}

export async function appendTrack(
  id: string,
  track: Omit<SavedTrack, "position" | "addedAt">,
): Promise<{ added: boolean; reason?: string }> {
  const playlist = await getPlaylist(id);
  if (!playlist) return { added: false, reason: "Không tìm thấy playlist" };

  // So bằng dupeKey chứ không phải source+externalId: cùng một video thêm qua
  // youtu.be/ID và watch?v=ID có externalId khác nhau nhưng vẫn là một bài.
  const key = dupeKey(track as SavedTrack);
  if (playlist.tracks.some((t) => dupeKey(t) === key)) {
    return { added: false, reason: "Bài này đã có trong playlist" };
  }

  const blocked = await blockedKeys(playlist.ownerId, playlist.guildId);
  if (blocked.has(key)) return { added: false, reason: "blocked" };

  const col = await playlists();
  await col.updateOne({ _id: new ObjectId(id) } as object, {
    $push: { tracks: { ...track, position: playlist.tracks.length, addedAt: new Date() } },
    $set: { updatedAt: new Date() },
  });
  return { added: true };
}

/** Mọi r2Key đang được dùng, để phát hiện object mồ côi trong bucket. */
export async function allUsedR2Keys(): Promise<
  Map<string, { playlistId: string; playlistName: string; title: string }>
> {
  const out = new Map<string, { playlistId: string; playlistName: string; title: string }>();
  for (const playlist of await listAllPlaylists()) {
    for (const track of playlist.tracks) {
      if (track.r2Key) {
        out.set(track.r2Key, {
          playlistId: playlist._id,
          playlistName: playlist.name,
          title: track.title,
        });
      }
    }
  }
  return out;
}
