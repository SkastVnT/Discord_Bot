import { YouTubePlugin } from "@ziplayer/plugin";
import type { SearchResult, Track } from "ziplayer";
import {
  parseYouTubeUrl,
  buildYouTubeSearchCandidates,
  extractYouTubeVideoId,
  extractYouTubeListId,
  isYouTubeMix,
  fetchYouTubeTitle,
  looksLikeCompilation,
  youtubeThumbnailUrl,
  toSingleVideoUrl,
} from "../utils/youtube.js";
import { trackAuthor } from "../utils/embeds.js";
import { trackDurationToMs } from "../utils/duration.js";
import { fetchWithYtdlp } from "./ytdlp.js";
import { fetchSpotify, type SpotifyTrack } from "./spotify.js";
import { buildYouTubeQuery, isSpotifyUrl } from "../utils/spotify.js";
import { PlaylistError } from "../types/playlist.js";
import type { ImportedTrack, PlaylistImportResult } from "../types/playlist.js";

/**
 * Đọc dữ liệu thật từ YouTube cho cả `/play` lẫn `/playlist import`.
 *
 * `searchWithFallback` và `dropCompilations` trước đây nằm trong slash/play.ts.
 * Chuyển sang đây để hai đường vào dùng chung một cách xử lý Mix và một bộ lọc
 * video tổng hợp — nếu nhân bản thì sớm muộn hai bên sẽ lệch nhau.
 */

/** Hàm tìm kiếm, để chỗ gọi tự quyết định dùng Player hay plugin rời. */
export type SearchFn = (query: string, requestedBy: string) => Promise<SearchResult | null>;

// ─── Plugin rời cho đường import ─────────────────────────────────────────────
// YouTubePlugin KHÔNG cần Player: constructor chỉ làm `this.player = options?.player
// ?? undefined`, còn search() chỉ dùng Innertube. Nhờ vậy `/playlist import` chạy
// được cả khi bot chưa vào voice channel nào.
let importPlugin: YouTubePlugin | null = null;

function getImportPlugin(): YouTubePlugin {
  if (!importPlugin) {
    // Kiểu khai báo bắt buộc `player` nhưng runtime thì không — xem chú thích trên.
    importPlugin = new YouTubePlugin({} as never);
  }
  return importPlugin;
}

export const importSearch: SearchFn = (query, requestedBy) =>
  getImportPlugin().search(query, requestedBy);

// ─── Lọc video tổng hợp ───────────────────────────────────────────────────────
/**
 * Bỏ các video tổng hợp khỏi kết quả playlist/Mix.
 *
 * Feed của YouTube Mix với nhạc Việt phần lớn là playlist 1 tiếng, full album,
 * "TOP 20"... nên nếu đưa hết vào queue thì queue thành một đống playlist chứ
 * không phải từng bài hát.
 *
 * Nếu lọc xong còn dưới 2 bài thì giữ nguyên danh sách gốc: queue ồn còn hơn
 * queue rỗng, và cũng để không kích hoạt sai nhánh "Mix chỉ có một bài".
 */
export function dropCompilations(tracks: Track[]): { tracks: Track[]; droppedCount: number } {
  const kept = tracks.filter((t) => !looksLikeCompilation(t.title));
  if (kept.length < 2) {
    console.log(`[import] bỏ qua bước lọc: chỉ còn ${kept.length}/${tracks.length} bài sau khi lọc`);
    return { tracks, droppedCount: 0 };
  }
  const droppedCount = tracks.length - kept.length;
  if (droppedCount > 0) {
    console.log(`[import] đã lọc ${droppedCount}/${tracks.length} video tổng hợp khỏi playlist`);
    for (const t of tracks.filter((x) => looksLikeCompilation(x.title))) {
      console.log(`[import]   bỏ: ${t.title}`);
    }
  }
  return { tracks: kept, droppedCount };
}

// ─── Tìm kiếm có dự phòng ─────────────────────────────────────────────────────
export async function searchWithFallback(
  search: SearchFn,
  query: string,
  requestedBy: string,
  tag = "play",
): Promise<SearchResult | null> {
  const candidates = buildYouTubeSearchCandidates(query);
  const videoId = extractYouTubeVideoId(query);
  const wantMix = isYouTubeMix(query);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      if (candidate !== query) {
        console.log(`[${tag}] Retry search with fallback candidate: ${candidate}`);
      }
      const result = await search(candidate, requestedBy);

      console.log(`[${tag} debug]`, {
        originalQuery: query,
        candidate,
        listId: extractYouTubeListId(query),
        hasPlaylist: Boolean(result?.playlist),
        trackCount: result?.tracks?.length ?? 0,
        firstTracks: result?.tracks?.slice(0, 10).map((track) => ({
          title: track.title,
          author: trackAuthor(track),
          url: track.url,
        })),
      });

      if (!result?.tracks?.length) continue;

      // YouTubePlugin vẫn trả `playlist: {name: "YouTube Mix"}` kèm đúng 1 track khi
      // watch_next_feed rỗng, và không throw. Một bài không phải là Mix thành công.
      if (wantMix && (!result.playlist || result.tracks.length <= 1)) {
        console.warn(`[${tag}] YouTube Mix degraded to a single track: ${candidate}`);
        continue;
      }

      return result;
    } catch (err) {
      lastError = err;
      console.log(`[${tag}] Search candidate failed: ${candidate} -> ${(err as Error).message}`);
    }
  }

  // Mix không được hạ cấp sang tìm-theo-tên: đó chính là đường tạo ra queue sai.
  if (wantMix) throw new Error("YOUTUBE_MIX_DEGRADED");

  // Tất cả URL forms đều fail → thử fetch title qua oEmbed rồi search theo tên
  if (videoId) {
    console.log(`[${tag}] All URL variants failed, fetching title via oEmbed for: ${videoId}`);
    const title = await fetchYouTubeTitle(videoId);
    if (title) {
      console.log(`[${tag}] oEmbed title: "${title}", searching by title...`);
      try {
        const result = await search(title, requestedBy);
        if (result?.tracks?.length) return result;
      } catch (err) {
        console.log(`[${tag}] Title search also failed: ${(err as Error).message}`);
      }
    } else {
      console.log(`[${tag}] oEmbed returned no title (invalid video ID or network error)`);
    }
    throw new Error("YOUTUBE_URL_FAILED");
  }

  if (lastError) throw lastError;
  return null;
}

// ─── Preview cho /playlist import ─────────────────────────────────────────────

function maxTracks(): number {
  const raw = Number(process.env.PLAYLIST_IMPORT_MAX_TRACKS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 100;
}

/** Track của ziplayer → ImportedTrack, chuẩn hóa đơn vị và URL. */
function toImportedTrack(track: Track, index: number): ImportedTrack | null {
  const externalId = extractYouTubeVideoId(track.url ?? "") ?? track.id;
  if (!externalId) return null;

  const url = toSingleVideoUrl(track.url ?? "") ?? `https://www.youtube.com/watch?v=${externalId}`;
  const author = trackAuthor(track, "");

  return {
    importIndex: index,
    source: "youtube",
    externalId,
    url,
    title: track.title || "Không rõ tên",
    ...(author ? { author } : {}),
    ...(trackDurationToMs(track.duration) != null
      ? { durationMs: trackDurationToMs(track.duration) }
      : {}),
    thumbnail: track.thumbnail ?? youtubeThumbnailUrl(externalId),
  };
}

// ─── Bổ sung metadata thiếu ───────────────────────────────────────────────────

/** Số bài hỏi lại song song. Nhỏ để không nện YouTube quá tay. */
const ENRICH_CONCURRENCY = 4;

function needsEnrich(track: ImportedTrack): boolean {
  return track.durationMs == null || !track.author;
}

/**
 * Hỏi lại YouTube để lấp thời lượng và tên ca sĩ còn thiếu.
 *
 * VÌ SAO CẦN: track lấy từ `watch_next_feed` của một Mix không kèm `length_seconds`
 * lẫn tên kênh — đo thực tế chỉ 1/21 bài có đủ dữ liệu. Đường lấy thông tin đầy đủ
 * là `getBasicInfo` của một URL video đơn, tức phải hỏi từng bài một.
 *
 * CHẠY LÚC NÀO: chỉ ngay trước khi ghi xuống database, và chỉ với những bài người
 * dùng đã chọn. Làm lúc preview thì phải hỏi cả trăm bài mà phần lớn sẽ bị bỏ,
 * còn để trống thì playlist lưu xong hiện "—" mãi mãi.
 *
 * Bài nào hỏi không được thì giữ nguyên — thiếu thời lượng vẫn phát được.
 */
export async function enrichTracks(tracks: ImportedTrack[]): Promise<ImportedTrack[]> {
  const pending = tracks.filter(needsEnrich);
  if (!pending.length) return tracks;

  console.log(`[import] bổ sung metadata cho ${pending.length}/${tracks.length} bài`);
  const byId = new Map(tracks.map((t) => [t.externalId, t]));

  for (let i = 0; i < pending.length; i += ENRICH_CONCURRENCY) {
    const slice = pending.slice(i, i + ENRICH_CONCURRENCY);
    await Promise.all(
      slice.map(async (track) => {
        try {
          const result = await importSearch(track.url, "enrich");
          const fresh = result?.tracks?.[0];
          if (!fresh) return;

          // Đảm bảo đúng video: search có thể rơi về tìm-theo-tên và trả bài khác.
          if (extractYouTubeVideoId(fresh.url ?? "") !== track.externalId) return;

          const target = byId.get(track.externalId);
          if (!target) return;

          const ms = trackDurationToMs(fresh.duration);
          if (target.durationMs == null && ms != null) target.durationMs = ms;

          const author = trackAuthor(fresh, "");
          if (!target.author && author) target.author = author;

          if (!target.thumbnail && fresh.thumbnail) target.thumbnail = fresh.thumbnail;
        } catch (err) {
          console.warn(`[import] không bổ sung được "${track.title}": ${(err as Error).message}`);
        }
      }),
    );
  }

  return tracks;
}

// ─── Spotify ──────────────────────────────────────────────────────────────────

/**
 * Tìm video YouTube tương ứng cho một bài Spotify.
 *
 * Spotify không cho stream nên mọi bài Spotify cuối cùng đều phải phát bằng
 * YouTube. Giữ NGUYÊN tên bài và ca sĩ của Spotify — chúng sạch hơn hẳn tiêu đề
 * YouTube kiểu "Tên bài (Official MV) [4K] | Kênh XYZ" — chỉ thay URL.
 */
async function matchSpotifyTrack(track: SpotifyTrack, index: number): Promise<ImportedTrack | null> {
  const query = buildYouTubeQuery(track.title, track.artists);
  try {
    const result = await importSearch(query, "spotify");
    const hit = result?.tracks?.[0];
    const videoId = extractYouTubeVideoId(hit?.url ?? "");
    if (!hit || !videoId) {
      console.warn(`[spotify] không khớp được YouTube cho "${query}"`);
      return null;
    }

    return {
      importIndex: index,
      source: "youtube",
      externalId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: track.title,
      ...(track.artists.length ? { author: track.artists.join(", ") } : {}),
      // Ưu tiên thời lượng của Spotify: chính xác hơn, còn video YouTube hay kèm
      // intro/outro nên dài hơn bản gốc.
      ...(track.durationMs
        ? { durationMs: track.durationMs }
        : trackDurationToMs(hit.duration) != null
          ? { durationMs: trackDurationToMs(hit.duration) }
          : {}),
      thumbnail: track.thumbnail ?? hit.thumbnail ?? youtubeThumbnailUrl(videoId),
    };
  } catch (err) {
    console.warn(`[spotify] lỗi khớp "${query}": ${(err as Error).message}`);
    return null;
  }
}

/** Số bài khớp song song. Giữ nhỏ để không nện YouTube quá tay. */
const MATCH_CONCURRENCY = 4;

async function previewSpotify(url: string): Promise<PlaylistImportResult> {
  const spotify = await fetchSpotify(url);
  if (!spotify.tracks.length) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  const limit = maxTracks();
  const wanted = spotify.tracks.slice(0, limit);
  console.log(`[spotify] ${spotify.kind} "${spotify.name ?? ""}" — ${wanted.length} bài, đang khớp YouTube`);

  const matched: ImportedTrack[] = [];
  for (let i = 0; i < wanted.length; i += MATCH_CONCURRENCY) {
    const slice = wanted.slice(i, i + MATCH_CONCURRENCY);
    const results = await Promise.all(slice.map((t, j) => matchSpotifyTrack(t, i + j)));
    for (const track of results) if (track) matched.push(track);
  }

  if (!matched.length) throw new PlaylistError("SPOTIFY_NO_MATCH");

  const unmatched = wanted.length - matched.length;
  if (unmatched) console.warn(`[spotify] ${unmatched}/${wanted.length} bài không tìm được trên YouTube`);

  matched.forEach((t, i) => (t.importIndex = i));

  return {
    source: {
      provider: "spotify",
      // Album/playlist của Spotify tương đương một playlist thường ở phía ta.
      kind: spotify.kind === "track" ? "video" : "playlist",
      sourceUrl: url,
      ...(spotify.name ? { title: spotify.name } : {}),
    },
    tracks: matched,
    droppedCount: unmatched,
  };
}

/**
 * Đọc một URL YouTube thành danh sách bài để người dùng chọn.
 *
 * Đường chính là YouTubePlugin (chạy trong process, nhanh). Chỉ khi nó không ra
 * kết quả — kể cả trường hợp Mix bị hạ cấp còn một bài — mới gọi yt-dlp.
 */
export async function previewPlaylist(
  rawUrl: string,
  requestedBy: string,
): Promise<PlaylistImportResult> {
  // Spotify đi đường riêng: lấy metadata từ Web API rồi khớp sang YouTube.
  if (isSpotifyUrl(rawUrl)) return previewSpotify(rawUrl);

  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed) throw new PlaylistError("INVALID_URL");

  const limit = maxTracks();
  let tracks: ImportedTrack[] = [];
  let playlistTitle: string | undefined;
  let droppedCount = 0;

  try {
    const result = await searchWithFallback(
      importSearch,
      parsed.canonicalUrl,
      requestedBy,
      "import",
    );

    if (result?.tracks?.length) {
      let list = result.tracks;
      if (parsed.kind !== "video" && list.length > 1) {
        const filtered = dropCompilations(list);
        list = filtered.tracks;
        droppedCount = filtered.droppedCount;
      }
      playlistTitle = result.playlist?.name;
      tracks = list
        .slice(0, limit)
        .map((t, i) => toImportedTrack(t, i))
        .filter((t): t is ImportedTrack => t !== null);
    }
  } catch (err) {
    console.warn(`[import] đường chính thất bại: ${(err as Error).message} — thử yt-dlp`);
  }

  // Dự phòng: yt-dlp. Chạy khi đường chính rỗng hoặc ném lỗi (gồm cả Mix hạ cấp).
  if (!tracks.length) {
    const viaYtdlp = await fetchWithYtdlp(parsed.canonicalUrl, limit);
    tracks = viaYtdlp.tracks;
    playlistTitle = viaYtdlp.playlistTitle;
  }

  if (!tracks.length) throw new PlaylistError("PLAYLIST_NOT_FOUND");

  // Đánh lại importIndex sau khi lọc để index liên tục từ 0 — UI và phần xác nhận
  // đều dựa vào chỉ số này nên không được có lỗ hổng.
  tracks.forEach((t, i) => (t.importIndex = i));

  return {
    source: {
      provider: "youtube",
      kind: parsed.kind,
      sourceUrl: rawUrl,
      ...(parsed.videoId ? { videoId: parsed.videoId } : {}),
      ...(parsed.listId ? { listId: parsed.listId } : {}),
      ...(playlistTitle ? { title: playlistTitle } : {}),
    },
    tracks,
    droppedCount,
  };
}
