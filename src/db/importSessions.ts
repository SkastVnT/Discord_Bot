import { randomBytes } from "crypto";
import type { Collection } from "mongodb";
import { getDb } from "./mongo.js";
import { PlaylistError } from "../types/playlist.js";
import type { ImportedTrack, PlaylistImportSessionDocument } from "../types/playlist.js";

/**
 * Phiên chọn bài, lưu server-side.
 *
 * VÌ SAO Ở DATABASE chứ không phải Map trong bộ nhớ: metadata bài hát KHÔNG được
 * lấy từ những gì client gửi lên. Discord chỉ gửi lại customId và các giá trị đã
 * tick, còn title/url/duration phải tra lại từ phiên do server tạo. Để trong Mongo
 * thì phiên sống qua được lần restart bot giữa chừng, và TTL index tự dọn rác.
 */

function collection(): Collection<PlaylistImportSessionDocument> {
  return getDb().collection<PlaylistImportSessionDocument>("playlist_import_sessions");
}

function ttlMs(): number {
  const minutes = Number(process.env.PLAYLIST_IMPORT_TTL_MINUTES);
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  return safe * 60_000;
}

/**
 * ID phiên: 8 ký tự ngẫu nhiên.
 *
 * Ngắn vì phải nhét vừa `customId` của component (trần 100 ký tự) cùng với tiền tố
 * và số trang. Ngẫu nhiên chứ không tuần tự để không ai đoán được phiên của người khác.
 */
function newSessionId(): string {
  return randomBytes(6).toString("base64url");
}

export async function createSession(params: {
  userId: string;
  guildId: string;
  sourceUrl: string;
  sourceTitle?: string;
  tracks: ImportedTrack[];
}): Promise<PlaylistImportSessionDocument> {
  const now = new Date();
  const doc: PlaylistImportSessionDocument = {
    sessionId: newSessionId(),
    userId: params.userId,
    guildId: params.guildId,
    sourceUrl: params.sourceUrl,
    ...(params.sourceTitle ? { sourceTitle: params.sourceTitle } : {}),
    tracks: params.tracks,
    selectedIndexes: [],
    page: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs()),
  };
  await collection().insertOne(doc);
  return doc;
}

/**
 * Lấy phiên và kiểm tra quyền.
 *
 * Ba điều kiện của spec §8 kiểm cùng một chỗ để không nơi nào quên: đúng người,
 * đúng server, còn hạn. TTL index của Mongo dọn theo chu kỳ ~60s nên vẫn phải tự
 * so `expiresAt` chứ không tin việc document đã biến mất.
 */
export async function getSession(
  sessionId: string,
  userId: string,
  guildId: string,
): Promise<PlaylistImportSessionDocument> {
  const doc = await collection().findOne({ sessionId });
  if (!doc) throw new PlaylistError("IMPORT_SESSION_EXPIRED");
  if (doc.userId !== userId || doc.guildId !== guildId) {
    console.warn(`[playlist] chặn truy cập phiên ${sessionId} sai chủ sở hữu (user ${userId})`);
    throw new PlaylistError("IMPORT_SESSION_EXPIRED");
  }
  if (doc.expiresAt.getTime() <= Date.now()) throw new PlaylistError("IMPORT_SESSION_EXPIRED");
  return doc;
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<PlaylistImportSessionDocument, "selectedIndexes" | "page" | "targetPlaylistId">>,
): Promise<void> {
  await collection().updateOne({ sessionId }, { $set: patch });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await collection().deleteOne({ sessionId });
}
