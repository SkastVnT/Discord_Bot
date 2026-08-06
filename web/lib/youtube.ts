import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { createRequire } from "module";
import type { SavedTrack } from "./types";

/**
 * Đọc metadata YouTube cho UI dev bằng yt-dlp.
 *
 * VÌ SAO KHÔNG DÙNG LẠI YouTubePlugin CỦA BOT: plugin nằm trong source ESM của
 * bot với quy ước import `./x.js`, webpack của Next không giải được. yt-dlp là
 * một tiến trình con nên gọi từ đâu cũng như nhau, và binary đã có sẵn trong
 * node_modules/youtube-dl-exec của bot.
 */

const require = createRequire(import.meta.url);

const TIMEOUT_MS = 30_000;
const LONG_HOSTS = ["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com"];

function resolveBinary(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

  // Tìm trong node_modules của bot (thư mục cha) trước, rồi mới tới của web.
  for (const base of [path.resolve(process.cwd(), ".."), process.cwd()]) {
    for (const name of ["yt-dlp.exe", "yt-dlp"]) {
      const candidate = path.join(base, "node_modules", "youtube-dl-exec", "bin", name);
      if (existsSync(candidate)) return candidate;
    }
  }
  try {
    const pkg = require.resolve("youtube-dl-exec/package.json");
    for (const name of ["yt-dlp.exe", "yt-dlp"]) {
      const candidate = path.join(path.dirname(pkg), "bin", name);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* rơi xuống PATH */
  }
  return "yt-dlp";
}

/** Chỉ nhận http/https và hostname khớp CHÍNH XÁC allowlist. */
export function isYouTubeUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || LONG_HOSTS.includes(host);
  } catch {
    return false;
  }
}

interface YtdlpEntry {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  duration_string?: string;
  thumbnail?: string;
}

interface YtdlpPayload extends YtdlpEntry {
  entries?: YtdlpEntry[];
}

function parseDuration(entry: YtdlpEntry): number | undefined {
  if (typeof entry.duration === "number" && entry.duration > 0) {
    return Math.round(entry.duration * 1000);
  }
  if (entry.duration_string) {
    const parts = entry.duration_string.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return undefined;
    let seconds = 0;
    for (const p of parts) seconds = seconds * 60 + p!;
    return seconds > 0 ? seconds * 1000 : undefined;
  }
  return undefined;
}

/**
 * Trả về các bài của một URL YouTube (video đơn, playlist hoặc Mix).
 *
 * URL luôn là một phần tử riêng trong mảng argument của execFile — execFile
 * không sinh shell nên chuỗi người dùng nhập không thể thoát ra thành lệnh khác.
 */
export function resolveYouTube(
  url: string,
  addedBy: string,
  limit = 100,
): Promise<Omit<SavedTrack, "position" | "addedAt">[]> {
  return new Promise((resolve, reject) => {
    if (!isYouTubeUrl(url)) {
      reject(new Error("Chỉ nhận link YouTube hợp lệ"));
      return;
    }

    execFile(
      /*turbopackIgnore: true*/ resolveBinary(),
      ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-end", String(limit), url],
      { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const text = String(stderr || "").slice(0, 300);
          console.warn("[web/yt-dlp]", text);
          if ((error as { killed?: boolean }).killed) reject(new Error("yt-dlp quá hạn 30 giây"));
          else if (/private|sign in/i.test(text)) reject(new Error("Video/playlist ở chế độ riêng tư"));
          else if (/not found|unavailable/i.test(text)) reject(new Error("Không tìm thấy video/playlist"));
          else reject(new Error("yt-dlp không đọc được link này"));
          return;
        }

        let payload: YtdlpPayload;
        try {
          payload = JSON.parse(stdout) as YtdlpPayload;
        } catch {
          reject(new Error("yt-dlp trả JSON không đọc được"));
          return;
        }

        const entries = payload.entries?.length ? payload.entries : [payload];
        const tracks = entries
          .filter((e) => e.id && e.title && !/^\[(deleted|private|unavailable) video\]$/i.test(e.title))
          .slice(0, limit)
          .map((e) => ({
            source: "youtube" as const,
            externalId: e.id!,
            url: `https://www.youtube.com/watch?v=${e.id}`,
            title: e.title!,
            ...(e.uploader || e.channel ? { author: e.uploader ?? e.channel } : {}),
            ...(parseDuration(e) != null ? { durationMs: parseDuration(e) } : {}),
            thumbnail: e.thumbnail ?? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
            addedBy,
          }));

        if (!tracks.length) reject(new Error("Không có bài nào đọc được từ link này"));
        else resolve(tracks);
      },
    );
  });
}
