import type { ReactNode } from "react";
import { ScrollTop } from "./ScrollTop";
import "./globals.css";

export const metadata = {
  title: "Playlist Manager (dev)",
  description: "Công cụ nội bộ quản lý playlist của Discord bot",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <div className="wrap">
          <header className="top">
            <h1>🎵 Playlist Manager</h1>
            <span className="badge">dev · localhost</span>
            <nav>
              <a href="/">Playlist</a>
              <a href="/blocked">Đã chặn</a>
              <a href="/storage">Storage R2</a>
            </nav>
          </header>
          {children}
        </div>
        <ScrollTop />
      </body>
    </html>
  );
}
