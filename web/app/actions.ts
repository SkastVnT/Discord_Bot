"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  appendTrack,
  createPlaylist,
  dedupeByUrl,
  deletePlaylist,
  getPlaylist,
  moveTrack,
  removeTrack,
  removeTracksAt,
  renamePlaylist,
} from "@/lib/db";
import { blockTracks, unblock } from "@/lib/blocklist";
import { deleteObject, uploadBuffer } from "@/lib/r2";
import { resolveYouTube } from "@/lib/youtube";

/**
 * Mọi thao tác ghi của UI dev.
 *
 * Trả về `{ error }` thay vì ném, để form hiện được thông báo thay vì đổ ra
 * trang lỗi của Next.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  const message = err instanceof Error ? err.message : "Lỗi không rõ";
  console.error("[web/action]", err);
  return { ok: false, error: message };
}

function defaultOwner(): string {
  return (process.env.BOT_OWNER_IDS ?? "").split(",")[0]?.trim() ?? "";
}

export async function actionCreatePlaylist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const ownerId = String(formData.get("ownerId") ?? "").trim() || defaultOwner();
    const guildId = String(formData.get("guildId") ?? "").trim();

    if (!name) return { ok: false, error: "Chưa nhập tên playlist" };
    if (!ownerId) return { ok: false, error: "Chưa có ownerId (đặt BOT_OWNER_IDS trong .env.local)" };
    if (!guildId) return { ok: false, error: "Chưa nhập guildId" };

    await createPlaylist(ownerId, guildId, name);
    revalidatePath("/");
    return { ok: true, message: `Đã tạo "${name}"` };
  } catch (err) {
    // 11000 = trùng unique index (ownerId, guildId, normalizedName) — cùng ràng
    // buộc mà bot đang dùng.
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, error: "Đã có playlist trùng tên cho owner/guild này" };
    }
    return fail(err);
  }
}

export async function actionRenamePlaylist(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id"));
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Tên trống" };
    await renamePlaylist(id, name);
    revalidatePath(`/p/${id}`);
    revalidatePath("/");
    return { ok: true, message: "Đã đổi tên" };
  } catch (err) {
    return fail(err);
  }
}

export async function actionDeletePlaylist(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const keys = await deletePlaylist(id);
  // Dọn file trên R2 theo playlist, giống hành vi của bot. Xóa hụt chỉ tốn dung
  // lượng nên không được để nó chặn luồng.
  for (const key of keys) await deleteObject(key).catch(() => {});
  revalidatePath("/");
  redirect("/");
}

export async function actionRemoveTrack(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const position = Number(formData.get("position"));
  const playlist = await getPlaylist(id);
  const removed = await removeTrack(id, position);
  if (!removed || !playlist) return;

  // Loại bỏ = "không muốn nghe nữa": ghi vào danh sách chặn để lần import sau
  // bài này không bò lại vào.
  await blockTracks(playlist.ownerId, playlist.guildId, [removed]).catch(() => {});
  if (removed.r2Key) await deleteObject(removed.r2Key).catch(() => {});
  revalidatePath(`/p/${id}`);
}

export async function actionUnblock(formData: FormData): Promise<void> {
  await unblock(
    String(formData.get("ownerId")),
    String(formData.get("guildId")),
    String(formData.get("key")),
  );
  revalidatePath("/blocked");
}

export async function actionRemoveSelected(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id"));
    const positions = formData
      .getAll("pos")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0);

    if (!positions.length) return { ok: false, error: "Chưa chọn bài nào" };

    const before = await getPlaylist(id);
    const removed = await removeTracksAt(id, positions);

    if (before) await blockTracks(before.ownerId, before.guildId, removed).catch(() => {});

    // Chỉ xoá file R2 khi không còn bài nào khác dùng chung key đó.
    const remaining = await getPlaylist(id);
    const stillUsed = new Set(remaining?.tracks.map((t) => t.r2Key).filter(Boolean));
    for (const track of removed) {
      if (track.r2Key && !stillUsed.has(track.r2Key)) {
        await deleteObject(track.r2Key).catch(() => {});
      }
    }

    revalidatePath(`/p/${id}`);
    return { ok: true, message: `Đã xóa ${removed.length} bài` };
  } catch (err) {
    return fail(err);
  }
}

export async function actionDedupe(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id"));
    const removed = await dedupeByUrl(id);
    revalidatePath(`/p/${id}`);
    return {
      ok: true,
      message: removed ? `Đã gộp ${removed} bài trùng` : "Không có bài nào trùng",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function actionMoveTrack(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await moveTrack(id, Number(formData.get("position")), Number(formData.get("delta")));
  revalidatePath(`/p/${id}`);
}

export async function actionAddFromYouTube(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id"));
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { ok: false, error: "Chưa nhập link" };

    const playlist = await getPlaylist(id);
    if (!playlist) return { ok: false, error: "Không tìm thấy playlist" };

    const tracks = await resolveYouTube(url, playlist.ownerId);

    let added = 0;
    let skipped = 0;
    let blocked = 0;
    for (const track of tracks) {
      const res = await appendTrack(id, track);
      if (res.added) added++;
      else if (res.reason === "blocked") blocked++;
      else skipped++;
    }

    // Gộp luôn sau khi thêm: playlist có thể đã chứa bản trùng từ trước (thêm
    // bằng bot, hoặc cùng video dưới dạng link khác), appendTrack chỉ chặn được
    // các bài mới chứ không dọn cái cũ.
    const merged = await dedupeByUrl(id);

    revalidatePath(`/p/${id}`);
    return {
      ok: true,
      message:
        `Đã thêm ${added} bài` +
        (skipped ? `, bỏ qua ${skipped} bài trùng` : "") +
        (blocked ? `, lọc ${blocked} bài đã chặn` : "") +
        (merged ? `, gộp ${merged} bản trùng có sẵn` : ""),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function actionUploadFile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = String(formData.get("id"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Chưa chọn file" };
    }

    const playlist = await getPlaylist(id);
    if (!playlist) return { ok: false, error: "Không tìm thấy playlist" };

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadBuffer(buffer, file.name, playlist.ownerId);

    const title =
      String(formData.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");

    await appendTrack(id, {
      source: "upload",
      externalId: uploaded.key,
      url: uploaded.url,
      title,
      addedBy: playlist.ownerId,
      r2Key: uploaded.key,
      fileBytes: uploaded.bytes,
    });

    const merged = await dedupeByUrl(id);

    revalidatePath(`/p/${id}`);
    return {
      ok: true,
      message: `Đã tải lên "${title}"` + (merged ? `, gộp ${merged} bản trùng` : ""),
    };
  } catch (err) {
    return fail(err);
  }
}

/** Xóa object trên R2 từ trang Storage. Chỉ cho xóa file mồ côi. */
export async function actionDeleteOrphan(formData: FormData): Promise<void> {
  const key = String(formData.get("key"));
  await deleteObject(key).catch(() => {});
  revalidatePath("/storage");
}
