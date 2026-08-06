import { isR2Configured, listObjects } from "@/lib/r2";
import { formatBytes } from "@/lib/types";
import { actionDeleteOrphan } from "@/app/actions";
import { ConfirmButton } from "@/app/Form";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  if (!isR2Configured()) {
    return <div className="empty">Chưa cấu hình R2 trong web/.env.local</div>;
  }

  const objects = await listObjects();
  const orphans = objects.filter((o) => o.orphan);
  const totalBytes = objects.reduce((s, o) => s + o.size, 0);
  const orphanBytes = orphans.reduce((s, o) => s + o.size, 0);

  return (
    <>
      <div className="card">
        <h2>Bucket {process.env.R2_BUCKET_NAME}</h2>
        <div className="row">
          <span>
            {objects.length} object · {formatBytes(totalBytes)}
          </span>
          {orphans.length > 0 && (
            <span className="pill orphan">
              {orphans.length} mồ côi · {formatBytes(orphanBytes)}
            </span>
          )}
        </div>
        {orphans.length > 0 && (
          <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
            File mồ côi là file còn trên R2 nhưng không playlist nào trỏ tới — thường do
            xóa playlist lúc R2 lỗi. Chúng vẫn bị tính dung lượng.
          </p>
        )}
      </div>

      {objects.length === 0 ? (
        <div className="empty">Bucket trống.</div>
      ) : (
        <div className="list">
          {objects.map((o) => (
            <div key={o.key} className="item">
              <div className="main">
                <div className="title mono">
                  <a href={o.url} target="_blank" rel="noreferrer">
                    {o.key}
                  </a>
                </div>
                <div className="sub">
                  {formatBytes(o.size)}
                  {o.lastModified ? ` · ${o.lastModified.toLocaleString("vi-VN")}` : ""}
                  {o.usedBy ? ` · dùng trong "${o.usedBy.playlistName}"` : ""}
                </div>
              </div>

              {o.orphan ? (
                <>
                  <span className="pill orphan">mồ côi</span>
                  <ConfirmButton
                    action={actionDeleteOrphan}
                    fields={{ key: o.key }}
                    label="Xóa"
                    confirm={`Xóa vĩnh viễn ${o.key} khỏi R2?`}
                  />
                </>
              ) : (
                <a href={`/p/${o.usedBy!.playlistId}`} className="pill">
                  đang dùng
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
