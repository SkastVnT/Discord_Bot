import { notFound } from "next/navigation";
import { getPlaylist } from "@/lib/db";
import { formatMs } from "@/lib/types";
import {
  actionAddFromYouTube,
  actionDeletePlaylist,
  actionRenamePlaylist,
  actionUploadFile,
} from "@/app/actions";
import { ActionForm, ConfirmButton } from "@/app/Form";
import { TrackList } from "./TrackList";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playlist = await getPlaylist(id);
  if (!playlist) notFound();

  const tracks = [...playlist.tracks].sort((a, b) => a.position - b.position);
  const total = tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0);

  return (
    <>
      <div className="card">
        <h2>
          {playlist.name} · {tracks.length} bài · {formatMs(total)}
        </h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted mono">
            owner {playlist.ownerId} · guild {playlist.guildId}
          </span>
          <div style={{ marginLeft: "auto" }}>
            <ConfirmButton
              action={actionDeletePlaylist}
              fields={{ id }}
              label="Xóa playlist"
              confirm={`Xóa "${playlist.name}" và ${tracks.filter((t) => t.r2Key).length} file trên R2?`}
            />
          </div>
        </div>
        <ActionForm action={actionRenamePlaylist} label="Đổi tên">
          <input type="hidden" name="id" value={id} />
          <input type="text" name="name" defaultValue={playlist.name} className="grow" required />
        </ActionForm>
      </div>

      <div className="card">
        <h2>Thêm từ YouTube</h2>
        <ActionForm action={actionAddFromYouTube} label="Thêm">
          <input type="hidden" name="id" value={id} />
          <input
            type="text"
            name="url"
            placeholder="Link video, playlist hoặc Mix"
            className="grow"
            required
          />
        </ActionForm>
      </div>

      <div className="card">
        <h2>Tải file lên R2</h2>
        <ActionForm action={actionUploadFile} label="Tải lên">
          <input type="hidden" name="id" value={id} />
          <input type="file" name="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus,.aac" required />
          <input type="text" name="title" placeholder="Tên hiển thị (tùy chọn)" className="grow" />
        </ActionForm>
      </div>

      {tracks.length === 0 ? (
        <div className="empty">Playlist đang trống.</div>
      ) : (
        <TrackList id={id} tracks={tracks} />
      )}
    </>
  );
}
