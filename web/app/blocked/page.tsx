import { listAllBlocked } from "@/lib/blocklist";
import { actionUnblock } from "@/app/actions";
import { ConfirmButton } from "@/app/Form";

export const dynamic = "force-dynamic";

export default async function BlockedPage() {
  const blocked = await listAllBlocked();

  return (
    <>
      <div className="card">
        <h2>Danh sách chặn · {blocked.length} bài</h2>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Bài bị xóa khỏi playlist sẽ vào đây và không được thêm lại — kể cả khi dán
          lại link Mix chứa nó. Gỡ ở đây, hoặc trong Discord bằng{" "}
          <code className="mono">/playlist unblock</code> với link một video đơn.
        </p>
      </div>

      {blocked.length === 0 ? (
        <div className="empty">Chưa chặn bài nào.</div>
      ) : (
        <div className="list">
          {blocked.map((b) => (
            <div key={`${b.ownerId}:${b.guildId}:${b.key}`} className="item">
              <div className="main">
                <div className="title">
                  <a href={b.url} target="_blank" rel="noreferrer">
                    {b.title}
                  </a>
                </div>
                <div className="sub">
                  {b.author ? `${b.author} · ` : ""}
                  <span className="mono">{b.key}</span> ·{" "}
                  {new Date(b.blockedAt).toLocaleString("vi-VN")}
                </div>
              </div>
              <ConfirmButton
                action={actionUnblock}
                fields={{ ownerId: b.ownerId, guildId: b.guildId, key: b.key }}
                label="Gỡ chặn"
                className="ghost tiny"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
