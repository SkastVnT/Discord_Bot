"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { findDuplicates, formatBytes, formatMs, type SavedTrack } from "@/lib/types";
import {
  actionDedupe,
  actionMoveTrack,
  actionRemoveSelected,
  actionRemoveTrack,
  type ActionResult,
} from "@/app/actions";

const SOURCE_ICON: Record<string, string> = {
  youtube: "🔴",
  spotify: "🟢",
  soundcloud: "🟠",
  upload: "📁",
};

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={danger ? "danger" : "ghost"} disabled={pending}>
      {pending ? "Đang xử lý…" : label}
    </button>
  );
}

/**
 * Danh sách bài có tick chọn.
 *
 * Là client component vì trạng thái tick nằm ở trình duyệt. Khi gửi đi thì mỗi
 * ô đã tick thành một input `pos` ẩn, nên server nhận thẳng mảng vị trí mà không
 * cần API riêng.
 */
export function TrackList({ id, tracks }: { id: string; tracks: SavedTrack[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [removeState, removeAction] = useActionState(actionRemoveSelected, null);
  const [dedupeState, dedupeAction] = useActionState(actionDedupe, null);

  const duplicates = useMemo(() => findDuplicates(tracks), [tracks]);
  const allChecked = tracks.length > 0 && selected.size === tracks.length;

  function toggle(index: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected(allChecked ? new Set() : new Set(tracks.map((_, i) => i)));
  }

  /** Tick nhanh đúng các bản trùng, để xem lại trước khi xoá. */
  function selectDuplicates(): void {
    setSelected(new Set(duplicates));
  }

  // Đã tick ít nhất một bài thì coi như đang ở chế độ chọn.
  const selectMode = selected.size > 0;

  /**
   * Bấm vào thanh bài để tick, nhưng chỉ khi đang ở chế độ chọn.
   *
   * Bỏ qua nếu bấm trúng thứ vốn đã có hành vi riêng — link mở YouTube, nút
   * ↑ ↓ Xóa, thanh phát nhạc — nếu không thì bấm phát nhạc lại hoá ra tick bài.
   */
  function onRowClick(event: React.MouseEvent<HTMLDivElement>, index: number): void {
    if (!selectMode) return;
    if ((event.target as HTMLElement).closest("a, button, audio, input, form")) return;
    toggle(index);
  }

  const message = removeState ?? dedupeState;

  return (
    <>
      {message && (
        <div className={`msg ${message.ok ? "ok" : "err"}`}>
          {message.ok ? (message.message ?? "Xong") : message.error}
        </div>
      )}

      <div className="card">
        <div className="row">
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            <span>Chọn tất cả</span>
          </label>

          <span className="muted">
            {selected.size > 0 ? `đã chọn ${selected.size}/${tracks.length}` : `${tracks.length} bài`}
          </span>

          {duplicates.size > 0 && (
            <button type="button" className="ghost tiny" onClick={selectDuplicates}>
              Chọn {duplicates.size} bài trùng
            </button>
          )}

          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <form action={dedupeAction}>
              <input type="hidden" name="id" value={id} />
              <Submit
                label={duplicates.size > 0 ? `Gộp ${duplicates.size} bài trùng` : "Gộp bài trùng"}
              />
            </form>

            <form
              action={removeAction}
              onSubmit={(e) => {
                if (!window.confirm(`Xóa ${selected.size} bài đã chọn?`)) e.preventDefault();
                else setSelected(new Set());
              }}
            >
              <input type="hidden" name="id" value={id} />
              {[...selected].map((pos) => (
                <input key={pos} type="hidden" name="pos" value={pos} />
              ))}
              <button type="submit" className="danger" disabled={selected.size === 0}>
                Xóa {selected.size > 0 ? `${selected.size} bài` : "đã chọn"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="list">
        {tracks.map((t, i) => (
          <div
            key={`${t.source}:${t.externalId}:${i}`}
            className={`item${selected.has(i) ? " picked" : ""}${selectMode ? " selectable" : ""}`}
            onClick={(e) => onRowClick(e, i)}
          >
            <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
            <span className="idx">{i + 1}</span>
            <span title={t.source}>{SOURCE_ICON[t.source] ?? "🎵"}</span>

            <div className="main">
              <div className="title">
                <a href={t.url} target="_blank" rel="noreferrer">
                  {t.title}
                </a>
                {duplicates.has(i) && (
                  <span className="pill orphan" style={{ marginLeft: 8 }}>
                    trùng
                  </span>
                )}
              </div>
              <div className="sub">
                {t.author ?? "—"} · {formatMs(t.durationMs)}
                {t.fileBytes ? ` · ${formatBytes(t.fileBytes)}` : ""}
              </div>
            </div>

            {t.source === "upload" && <audio controls preload="none" src={t.url} />}

            <form action={actionMoveTrack}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="position" value={i} />
              <input type="hidden" name="delta" value={-1} />
              <button type="submit" className="ghost tiny">
                ↑
              </button>
            </form>
            <form action={actionMoveTrack}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="position" value={i} />
              <input type="hidden" name="delta" value={1} />
              <button type="submit" className="ghost tiny">
                ↓
              </button>
            </form>
            <form
              action={actionRemoveTrack}
              onSubmit={(e) => {
                if (!window.confirm(`Xóa "${t.title}"?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="position" value={i} />
              <button type="submit" className="danger tiny">
                Xóa
              </button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
