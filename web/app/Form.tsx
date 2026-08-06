"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "./actions";

/**
 * Bọc form dùng server action, hiện thông báo và tự khoá nút khi đang gửi.
 *
 * Tách thành client component vì useActionState/useFormStatus cần chạy phía
 * trình duyệt; phần còn lại của app giữ nguyên server component.
 */

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Đang xử lý…" : label}
    </button>
  );
}

export function ActionForm({
  action,
  label,
  children,
}: {
  action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>;
  label: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <>
      {state && (
        <div className={`msg ${state.ok ? "ok" : "err"}`}>
          {state.ok ? (state.message ?? "Xong") : state.error}
        </div>
      )}
      <form action={formAction} className="row">
        {children}
        <Submit label={label} />
      </form>
    </>
  );
}

/** Nút gọi action không cần kết quả trả về, có hỏi lại trước khi làm. */
export function ConfirmButton({
  action,
  fields,
  label,
  confirm,
  className = "danger tiny",
}: {
  action: (data: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
