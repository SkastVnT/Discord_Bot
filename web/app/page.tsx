import { listAllPlaylists } from "@/lib/db";
import { formatMs } from "@/lib/types";
import { actionCreatePlaylist } from "./actions";
import { ActionForm } from "./Form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const playlists = await listAllPlaylists();
  const defaultOwner = (process.env.BOT_OWNER_IDS ?? "").split(",")[0]?.trim() ?? "";
  // Gợi ý guild gần nhất để khỏi phải chép tay ID mỗi lần tạo playlist.
  const lastGuild = playlists[0]?.guildId ?? "";

  return (
    <>
      <div className="card">
        <h2>Tạo playlist</h2>
        <ActionForm action={actionCreatePlaylist} label="Tạo">
          <input type="text" name="name" placeholder="Tên playlist" className="grow" required />
          <input type="text" name="ownerId" placeholder="owner ID" defaultValue={defaultOwner} />
          <input type="text" name="guildId" placeholder="guild ID" defaultValue={lastGuild} required />
        </ActionForm>
      </div>

      {playlists.length === 0 ? (
        <div className="empty">Chưa có playlist nào.</div>
      ) : (
        <div className="list">
          {playlists.map((p) => {
            const total = p.tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0);
            const uploads = p.tracks.filter((t) => t.source === "upload").length;
            return (
              <a key={p._id} href={`/p/${p._id}`} className="item">
                <div className="main">
                  <div className="title">{p.name}</div>
                  <div className="sub">
                    {p.tracks.length} bài · {formatMs(total)}
                    {uploads > 0 && ` · ${uploads} file upload`}
                    {" · guild "}
                    <span className="mono">{p.guildId}</span>
                  </div>
                </div>
                <span className="muted">›</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
