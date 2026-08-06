import { execFile } from "child_process";
import { createRequire } from "module";
import { existsSync } from "fs";
import path from "path";
import type { ImportedTrack } from "../types/playlist.js";
import { PlaylistError } from "../types/playlist.js";
import { parseYtdlpDuration } from "../utils/duration.js";
import { youtubeThumbnailUrl } from "../utils/youtube.js";

/**
 * Đường phụ để đọc playlist khi YouTubePlugin không trả được.
 *
 * Chỉ dùng khi đường chính thất bại: yt-dlp là một child process, chậm hơn nhiều
 * và có thể không có trên máy. Đường chính (`YouTubePlugin.search`) chạy trong
 * process nên gần như luôn nhanh hơn.
 *
 * BẢO MẬT: URL luôn là MỘT PHẦN TỬ trong mảng argument của execFile, không bao giờ
 * ghép vào chuỗi shell. execFile không sinh shell nên URL của người dùng không thể
 * thoát ra thành lệnh khác.
 */

const require = createRequire(import.meta.url);

const TIMEOUT_MS = 25_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Tìm binary yt-dlp.
 *
 * `youtube-dl-exec` (đi kèm @ziplayer/ytexecplug) đã tải sẵn yt-dlp vào
 * node_modules nên mặc định dùng cái đó — người dùng không phải cài gì thêm.
 * YTDLP_PATH cho phép trỏ sang bản khác; cuối cùng mới đến PATH của hệ thống.
 */
function resolveBinary(): string | null {
  const fromEnv = process.env.YTDLP_PATH;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    // Không phải đường dẫn file thì coi như tên lệnh trên PATH.
    return fromEnv;
  }

  try {
    const pkg = require.resolve("youtube-dl-exec/package.json");
    const binDir = path.join(path.dirname(pkg), "bin");
    for (const name of ["yt-dlp.exe", "yt-dlp"]) {
      const candidate = path.join(binDir, name);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // youtube-dl-exec không có mặt — rơi xuống PATH.
  }

  return "yt-dlp";
}

let cachedBinary: string | null | undefined;

function binary(): string | null {
  if (cachedBinary === undefined) {
    cachedBinary = resolveBinary();
    console.log(`[ytdlp] binary: ${cachedBinary ?? "(không có)"}`);
  }
  return cachedBinary;
}

interface YtdlpEntry {
  id?: string;
  url?: string;
  webpage_url?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  duration_string?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
}

interface YtdlpPayload extends YtdlpEntry {
  _type?: string;
  entries?: YtdlpEntry[];
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = binary();
    if (!bin) {
      reject(new PlaylistError("PLAYLIST_FETCH_FAILED", "yt-dlp không có sẵn"));
      return;
    }

    const child = execFile(
      bin,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          // `killed` là dấu hiệu bị timeout giết, phân biệt với lỗi thường để
          // báo đúng nguyên nhân cho người dùng.
          if ((error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            reject(new PlaylistError("PLAYLIST_FETCH_TIMEOUT"));
            return;
          }
          const text = String(stderr || "");
          // Không trả stderr thô ra ngoài; chỉ đọc để phân loại rồi log nội bộ.
          console.warn(`[ytdlp] lỗi: ${text.slice(0, 400)}`);
          if (/private video|sign in|members[- ]only/i.test(text)) {
            reject(new PlaylistError("PLAYLIST_PRIVATE"));
          } else if (/does not exist|not found|unavailable/i.test(text)) {
            reject(new PlaylistError("PLAYLIST_NOT_FOUND"));
          } else {
            reject(new PlaylistError("PLAYLIST_FETCH_FAILED"));
          }
          return;
        }
        resolve(stdout);
      },
    );

    // execFile tự giết khi quá timeout, nhưng nếu process đã tách ra thì đảm bảo
    // không để lại tiến trình mồ côi.
    child.on("error", () => child.kill("SIGKILL"));
  });
}

function toTrack(entry: YtdlpEntry, index: number): ImportedTrack | null {
  const externalId = entry.id;
  if (!externalId) return null;

  const title = entry.title?.trim();
  // yt-dlp đặt title là "[Deleted video]" / "[Private video]" cho mục không xem được.
  if (!title || /^\[(deleted|private|unavailable) video\]$/i.test(title)) return null;

  return {
    importIndex: index,
    source: "youtube",
    externalId,
    url: `https://www.youtube.com/watch?v=${externalId}`,
    title,
    author: entry.uploader ?? entry.channel,
    durationMs: parseYtdlpDuration(entry.duration, entry.duration_string),
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url ?? youtubeThumbnailUrl(externalId),
  };
}

/**
 * Đọc playlist/video bằng yt-dlp.
 *
 * `--flat-playlist` chỉ lấy metadata, không chạm tới stream nên nhanh hơn nhiều.
 * `--playlist-end` chặn trần số bài để một playlist 5000 bài không treo bot.
 */
export async function fetchWithYtdlp(
  url: string,
  maxTracks: number,
): Promise<{ tracks: ImportedTrack[]; playlistTitle?: string }> {
  const stdout = await run([
    "--flat-playlist",
    "--dump-single-json",
    "--no-warnings",
    "--playlist-end",
    String(maxTracks),
    url,
  ]);

  let payload: YtdlpPayload;
  try {
    payload = JSON.parse(stdout) as YtdlpPayload;
  } catch {
    throw new PlaylistError("PLAYLIST_FETCH_FAILED", "yt-dlp trả JSON không đọc được");
  }

  const entries = payload.entries?.length ? payload.entries : [payload];
  const tracks: ImportedTrack[] = [];
  for (const entry of entries.slice(0, maxTracks)) {
    const track = toTrack(entry, tracks.length);
    if (track) tracks.push(track);
  }

  if (!tracks.length) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  console.log(`[ytdlp] đọc được ${tracks.length} bài từ ${url}`);
  return { tracks, playlistTitle: payload.entries?.length ? payload.title : undefined };
}
