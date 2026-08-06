"use client";

import { useEffect, useState } from "react";

/**
 * Nút cuộn lên đầu trang.
 *
 * Playlist dài cả trăm bài nên cuộn tay về đầu rất mệt. Chỉ hiện sau khi đã cuộn
 * quá một màn hình — ở đầu trang thì nút vô dụng mà còn che nội dung.
 */
export function ScrollTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    // passive: chỉ đọc scrollY chứ không preventDefault, báo cho trình duyệt biết
    // để nó không phải chờ handler mỗi lần cuộn.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`scroll-top${visible ? " show" : ""}`}
      aria-label="Lên đầu trang"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
    </button>
  );
}
