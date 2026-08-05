import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  type Message,
} from "discord.js";
import { getPlayer } from "ziplayer";
import type { Track } from "ziplayer";
import {
  COLORS,
  buildNowPlayingEmbed,
  buildControlRows,
  controlStateOf,
  successEmbed,
  warningEmbed,
  errorEmbed,
  type RequesterLike,
} from "../utils/embeds.js";
import { extractYouTubeVideoId } from "../utils/youtube.js";
import type { SlashCommand } from "../types/command.js";

export interface TimedLine {
  startMs: number;
  text: string;
}

/**
 * Payload của event `lyricsCreate` / `lyricsChange`.
 *
 * `@ziplayer/extension@0.3.3` không re-export type `LyricsResult` ở entrypoint
 * (index.d.ts chỉ export class `lyricsExt`), và `ManagerEvents` khai lyrics là `any`,
 * nên khai lại đúng các field mà lyricsExt thực sự emit.
 */
export interface LyricsPayload {
  provider?: "lrclib" | "lyricsovh";
  source?: string;
  url?: string;
  /** Lời thường */
  text?: string | null;
  /** Lời LRC có timestamp */
  synced?: string | null;
  current?: string | null;
  previous?: string | null;
  next?: string | null;
  lineIndex?: number;
  timeMs?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  matchedBy?: string;
  lang?: string | null;
}

export interface LiveLyricsSession {
  active: boolean;
  message: Message;
  embed: EmbedBuilder;
  track: Track;
  lines: string[];
  timedLines?: TimedLine[]; // YouTube captions with timestamps (synced)
  lastLine: string | null;
  plainShown: boolean;
  guildId: string;
  /** Hai hàng nút (điều khiển phát + chế độ/âm lượng). */
  controlRows?: ActionRowBuilder<ButtonBuilder>[];
  progressInterval?: ReturnType<typeof setInterval>;
  lyricsInterval?: ReturnType<typeof setInterval>;
  checkInterval?: ReturnType<typeof setInterval>;
  createdAt: number;
  lyricsAttempted: boolean; // đã thử fallback chưa
  /** Nguồn lyrics đang hiển thị, để ghi vào tên field: lrclib / lyricsovh / youtube-captions */
  lyricsSource?: string;
}

export const activeSessions = new Map<string, LiveLyricsSession>();

/** Chờ lyricsExt bao lâu trước khi thử nguồn phụ. */
const LYRICS_WAIT_MS = 12_000;

/**
 * Nhịp kiểm tra vị trí phát. 1200ms giữ độ trễ tối đa ~1,2s mà vẫn dưới ngưỡng
 * rate limit edit message của Discord (khoảng 5 request/5s cho một channel).
 */
const TICK_MS = 1_200;

/** Refresh embed định kỳ để thanh tiến trình không đứng yên khi không có lyrics. */
const FULL_REFRESH_MS = 5_000;

/**
 * Bù trễ hiển thị: mỗi tick cách nhau TICK_MS nên trung bình chậm TICK_MS/2, cộng
 * thêm ~200ms cho một lần edit qua Discord API.
 *
 * Không bù nhiều hơn: getTime().current lấy từ playbackDuration — lượng audio đã đẩy
 * ra voice connection — nên vốn đã hơi sớm hơn thứ người nghe thực sự nghe được.
 */
const LYRICS_LEAD_MS = TICK_MS / 2 + 200;

// --------------- Fallback lyrics helpers ---------------

async function fetchYouTubeCaptions(videoId: string): Promise<TimedLine[] | null> {
  for (const lang of ["vi", "en"]) {
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`,
        { headers: { "Accept-Language": "vi-VN,vi;q=0.9" } },
      );
      if (!res.ok) continue;
      const data = await res.json() as {
        events?: Array<{ tStartMs?: number; segs?: Array<{ utf8: string }> }>
      };
      if (!data?.events?.length) continue;
      const lines: TimedLine[] = data.events
        .filter(e => e.segs && e.tStartMs !== undefined)
        .map(e => ({
          startMs: e.tStartMs!,
          text: e.segs!.map(s => s.utf8).join("").replace(/\n/g, " ").trim(),
        }))
        .filter(l => l.text.length > 0);
      if (lines.length >= 4) {
        console.log(`[lyrics] Got ${lines.length} timed lines from YouTube captions (${lang})`);
        return lines;
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Nguồn phụ duy nhất: caption timedtext của YouTube (có timestamp thật).
 * Nguồn AI sinh lời đã bị bỏ — lời bịa còn tệ hơn không có lời.
 * LRCLIB và lyrics.ovh do lyricsExt tự lo, không gọi lại ở đây.
 *
 * CẢNH BÁO (đã kiểm chứng 04/08/2026): endpoint timedtext công khai giờ trả về
 * HTTP 200 với body RỖNG cho cả video có phụ đề — YouTube yêu cầu URL đã ký.
 * Lấy `base_url` đã ký từ youtubei.js cũng trả rỗng, và `info.getTranscript()`
 * trả 400 trên client WEB. Nên trên thực tế nhánh này gần như luôn thất bại;
 * giữ lại vì chi phí chỉ là một request, nhưng đừng trông cậy vào nó.
 */
export async function attemptFallbackLyrics(session: LiveLyricsSession): Promise<void> {
  if (session.lyricsAttempted || session.lines.length > 0) return;
  session.lyricsAttempted = true;

  const { track } = session;
  console.log(`[lyrics] chưa có lyrics sau ${LYRICS_WAIT_MS / 1000}s → thử YouTube captions: ${track.title}`);

  const videoId = extractYouTubeVideoId(track.url);
  if (videoId) {
    const captions = await fetchYouTubeCaptions(videoId);
    if (captions?.length) {
      session.timedLines = captions;
      session.lines = captions.map(l => l.text);
      session.lyricsSource = "youtube-captions";
      console.log(`[lyrics] selected synced=true source=youtube-captions parsedLines=${captions.length}`);
      await pushLyricsToEmbed(session);
      return;
    }
  }

  console.log(`[lyrics] Không tìm thấy lyrics từ nguồn nào cho: ${track.title}`);
}

// ─── LRC parser ───────────────────────────────────────────────────────────────
// Một dòng LRC có thể mang nhiều mốc thời gian: "[00:12.00][01:20.50]lời hát".
const LRC_TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(lrc: string): TimedLine[] {
  const out: TimedLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    LRC_TIMESTAMP.lastIndex = 0;
    const stamps: number[] = [];
    let consumed = 0;
    let match: RegExpExecArray | null;

    // Chỉ nhận các mốc nằm liền nhau ở đầu dòng, phần còn lại là lời.
    while ((match = LRC_TIMESTAMP.exec(line)) !== null && match.index === consumed) {
      consumed = match.index + match[0].length;
      const frac = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
      stamps.push(Number(match[1]) * 60_000 + Number(match[2]) * 1_000 + frac);
    }

    if (!stamps.length) continue; // dòng metadata kiểu [ar:...] hoặc rác
    const text = line.slice(consumed).trim();
    if (!text) continue; // khoảng lặng, không hiển thị

    for (const startMs of stamps) out.push({ startMs, text });
  }

  return out.sort((a, b) => a.startMs - b.startMs);
}

async function pushLyricsToEmbed(session: LiveLyricsSession): Promise<void> {
  try {
    const player = getPlayer(session.guildId);
    if (!player || !session.message) return;
    const freshEmbed = buildNowPlayingEmbed(session.track, player);
    addLyricsField(freshEmbed, session, player);
    session.embed = freshEmbed;
    await session.message
      .edit({ embeds: [freshEmbed], components: session.controlRows ?? [] })
      .catch(() => {});
  } catch { /* ignore */ }
}

/** Dòng đang hát = dòng cuối cùng có startMs <= vị trí phát hiện tại. */
export function currentLineIndex(timedLines: TimedLine[], positionMs: number): number {
  let idx = 0;
  for (let i = 0; i < timedLines.length; i++) {
    if (timedLines[i]!.startMs <= positionMs) idx = i;
    else break;
  }
  return idx;
}

/** Số dòng hiện thêm ở trước và sau dòng đang hát. */
const LYRICS_WINDOW = 2;

/** Cắt dòng quá dài để bớt wrap — wrap làm chiều cao embed nhảy mỗi lần đổi dòng. */
const LYRICS_LINE_MAX = 72;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Cửa sổ lyrics chạy theo nhạc.
 *
 * Dòng đang hát in đậm có mũi tên; các dòng quanh dùng subtext `-#` của Discord
 * (chữ nhỏ và mờ đi thật) nên mắt bắt ngay được dòng cần đọc mà vẫn thấy trước
 * câu tiếp theo.
 */
export function buildTimedCaptionsDisplay(timedLines: TimedLine[], positionMs: number): string {
  const currentIdx = currentLineIndex(timedLines, positionMs);
  const start = Math.max(0, currentIdx - LYRICS_WINDOW);
  const end = Math.min(timedLines.length - 1, currentIdx + LYRICS_WINDOW);

  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    const line = clip(timedLines[i]!.text, LYRICS_LINE_MAX);
    out.push(i === currentIdx ? `▸ **${line}**` : `-# ${line}`);
  }
  return out.join("\n");
}

export function buildLyricsDisplay(lines: string[], timedOut = false, isSearching = false): string {
  if (!lines.length) {
    if (isSearching) return "🔍 Đang tìm kiếm lyrics...";
    return timedOut
      ? "❌ Không tìm thấy lyrics cho bài này."
      : "⏳ Đang chờ lyrics...";
  }

  // Cửa sổ trượt từ payload `current` của lyricsExt: dòng cuối ĐÚNG là dòng đang hát.
  let display = "";
  for (let i = 0; i < lines.length - 1; i++) {
    display += `┃ *${lines[i]}*\n`;
  }
  display += `┃ **➤ ${lines[lines.length - 1]}**`;
  return display;
}

/** Ghép các dòng cho vừa giới hạn 1024 ký tự của một embed field. */
function fitLines(lines: string[], reserved = 0): string {
  const LIMIT = 1020 - reserved;
  let result = "";
  let shown = 0;
  for (const line of lines) {
    const addition = `${line}\n`;
    if (result.length + addition.length > LIMIT - 24) {
      result += `*...(+${lines.length - shown} dòng nữa)*`;
      break;
    }
    result += addition;
    shown++;
  }
  return result.trim();
}

/**
 * Lời thường: hiển thị dạng khối tĩnh và nói rõ là không chạy theo nhạc.
 *
 * Trước đây lời thường bị render bằng cùng format với lời synced (có mũi tên ➤ ở
 * dòng cuối) nên trông như đang chạy realtime dù thực chất đứng yên — gây hiểu nhầm
 * là bot hỏng, trong khi thật ra nguồn không hề có timestamp.
 */
export function buildPlainLyricsBlock(lines: string[]): string {
  const note = "-# 📄 Nguồn không có timestamp nên lời không chạy theo nhạc";
  const clipped = lines.map((l) => clip(l, LYRICS_LINE_MAX));
  return `${note}\n${fitLines(clipped, note.length + 1)}`;
}

/** Tên field lyrics, kèm nguồn để biết lời đang lấy từ đâu. */
export function lyricsFieldName(session: LiveLyricsSession): string {
  if (!session.lyricsSource) return "🎤 Lyrics";
  const kind = session.timedLines?.length ? "synced" : "lời thường";
  return `🎤 Lyrics · ${session.lyricsSource} · ${kind}`;
}

/**
 * Gắn field lyrics vào embed. Gom lại một chỗ vì trước đây cùng hai dòng
 * `addFields({ name: "🎤 Lyrics", value: ... })` bị lặp ở 5 nơi và đã có lần lệch nhau.
 */
export function addLyricsField(
  embed: EmbedBuilder,
  session: LiveLyricsSession,
  player: ReturnType<typeof getPlayer>,
): EmbedBuilder {
  return embed.addFields({
    name: lyricsFieldName(session),
    value: renderLyricsField(session, player),
  });
}

/** Chọn đúng cách hiển thị theo dữ liệu lyrics mà session đang có. */
export function renderLyricsField(
  session: LiveLyricsSession,
  player: ReturnType<typeof getPlayer>,
): string {
  if (session.timedLines?.length && player) {
    return buildTimedCaptionsDisplay(
      session.timedLines,
      player.getTime().current + LYRICS_LEAD_MS,
    );
  }
  if (session.plainShown && session.lines.length) {
    return buildPlainLyricsBlock(session.lines);
  }
  const timedOut = Date.now() - session.createdAt > LYRICS_WAIT_MS;
  const isSearching = timedOut && !session.lyricsAttempted && session.lines.length === 0;
  return buildLyricsDisplay(session.lines, timedOut, isSearching);
}

/** Đã chờ quá lâu mà chưa có lyrics → thử nguồn phụ (một lần duy nhất). */
export function shouldAttemptFallback(session: LiveLyricsSession): boolean {
  return Date.now() - session.createdAt > LYRICS_WAIT_MS && !session.lyricsAttempted;
}

/**
 * Timer duy nhất của một session, thay cho 3 bản copy-paste trước đây ở
 * index.ts, play.ts và livelyrics.ts.
 *
 * Tick mỗi TICK_MS nhưng CHỈ edit message khi dòng lyrics thực sự đổi, hoặc mỗi
 * FULL_REFRESH_MS để cập nhật thanh tiến trình. Nhờ vậy độ trễ tối đa giảm từ 5s
 * xuống ~1,2s mà số lần gọi API không tăng: một bài 62 dòng vẫn chỉ khoảng 62 lần
 * edit, đúng lúc dòng đổi, thay vì 5s một lần bất kể có đổi hay không.
 */
export function startSessionTicker(session: LiveLyricsSession): void {
  if (session.progressInterval) clearInterval(session.progressInterval);

  let lastLineIdx = -1;
  let lastFullRefresh = 0;

  session.progressInterval = setInterval(() => {
    void (async () => {
      try {
        const player = getPlayer(session.guildId);
        if (!player?.isPlaying) {
          if (session.progressInterval) clearInterval(session.progressInterval);
          return;
        }

        if (shouldAttemptFallback(session)) {
          attemptFallbackLyrics(session).catch(() => {}); // fire-and-forget
        }

        let lineChanged = false;
        if (session.timedLines?.length) {
          const idx = currentLineIndex(
            session.timedLines,
            player.getTime().current + LYRICS_LEAD_MS,
          );
          if (idx !== lastLineIdx) {
            lastLineIdx = idx;
            lineChanged = true;
          }
        }

        const now = Date.now();
        if (!lineChanged && now - lastFullRefresh < FULL_REFRESH_MS) return;
        lastFullRefresh = now;

        const freshEmbed = buildNowPlayingEmbed(session.track, player);
        addLyricsField(freshEmbed, session, player);
        // Cập nhật luôn nút để pause/loop/volume khớp trạng thái thật của player.
        const freshRows = buildControlRows(controlStateOf(player));
        session.controlRows = freshRows;
        session.embed = freshEmbed;
        await session.message.edit({ embeds: [freshEmbed], components: freshRows }).catch(() => {});
      } catch {
        // ignore
      }
    })();
  }, TICK_MS);
}

function buildSessionEmbed(
  session: LiveLyricsSession,
  player: ReturnType<typeof getPlayer>,
  requester?: RequesterLike | null,
): EmbedBuilder {
  const embed = buildNowPlayingEmbed(session.track, player, requester ?? null);
  return addLyricsField(embed, session, player);
}

export function updateLiveLyricsFromExt(
  guildId: string,
  track: Track | null,
  lyricsPayload: LyricsPayload,
): void {
  const session = activeSessions.get(guildId);
  if (!session?.active) return;
  if (!session.track) return;

  const sameTrack =
    (session.track.url && track?.url && session.track.url === track.url) ||
    session.track.title === track?.title;
  if (!sameTrack) return;

  // Đường tốt nhất: LRC đầy đủ. Parse một lần rồi để display chạy theo getTime(),
  // thay vì dồn từng dòng vào mảng (cách cũ lệch ngay khi seek hoặc pause).
  if (session.timedLines?.length) return;

  if (lyricsPayload?.synced) {
    const timed = parseLrc(lyricsPayload.synced);
    if (timed.length) {
      session.timedLines = timed;
      session.lines = timed.map((l) => l.text);
      session.lyricsAttempted = true;
      session.lyricsSource = lyricsPayload.provider ?? "lrclib";
      console.log(
        `[lyrics] selected synced=true source=${lyricsPayload.provider ?? "?"} parsedLines=${timed.length}`,
      );
      void pushLyricsToEmbed(session);
      return;
    }
  }

  const currentLine = lyricsPayload?.current?.trim() ?? "";
  const plainText = lyricsPayload?.text?.trim() ?? "";

  if (currentLine) {
    if (session.lastLine === currentLine) return;
    session.lastLine = currentLine;
    session.lines.push(currentLine);
    if (session.lines.length > 6) session.lines.shift();
  } else if (plainText && !session.plainShown) {
    // Giữ toàn bộ dòng: buildPlainLyricsBlock tự cắt cho vừa embed field.
    // (Trước đây slice(0,6) làm lời thường trông giống cửa sổ trượt của lời synced.)
    const lines = plainText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    session.plainShown = true;
    session.lines = lines;
    session.lastLine = lines[lines.length - 1] ?? null;
    session.lyricsSource = lyricsPayload.provider ?? "lrclib";
    console.log(
      `[lyrics] selected synced=false source=${lyricsPayload.provider ?? "?"} (lời thường, không có timestamp)`,
    );
  } else {
    return;
  }

  const currentPlayer = getPlayer(guildId);
  const freshEmbed = buildSessionEmbed(session, currentPlayer);
  session.embed = freshEmbed;
  session.message
    .edit({ embeds: [freshEmbed], components: session.controlRows ?? [] })
    .catch(() => {});
}

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("livelyrics")
    .setDescription("🎤 Hiển thị lyrics realtime đồng bộ với nhạc")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Bật hoặc tắt live lyrics")
        .setRequired(false)
        .addChoices({ name: "Bật", value: "on" }, { name: "Tắt", value: "off" }),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();

    const player = getPlayer(interaction.guildId!);
    const action = interaction.options.getString("action") ?? "on";

    if (!player?.isPlaying) {
      return interaction.editReply({
        embeds: [errorEmbed("Không có bài hát nào đang phát!")],
      });
    }

    const guildId = interaction.guildId!;

    if (action === "off") {
      const session = activeSessions.get(guildId);
      if (session) {
        session.active = false;
        if (session.lyricsInterval) clearInterval(session.lyricsInterval);
        if (session.progressInterval) clearInterval(session.progressInterval);
        if (session.checkInterval) clearInterval(session.checkInterval);
        activeSessions.delete(guildId);
        return interaction.editReply({ embeds: [successEmbed("Đã tắt live lyrics!")] });
      }
      return interaction.editReply({ embeds: [warningEmbed("Live lyrics chưa được bật!")] });
    }

    if (activeSessions.has(guildId)) {
      return interaction.editReply({
        embeds: [warningEmbed("Live lyrics đang hoạt động! Dùng `/livelyrics off` để tắt.")],
      });
    }

    const track = player.currentTrack!;
    const controlRows = buildControlRows(controlStateOf(player));

    // Dựng session trước rồi mới render, để embed đi qua đúng một đường
    // hiển thị lyrics (addLyricsField) thay vì tự lắp tay riêng ở đây.
    const session: LiveLyricsSession = {
      active: true,
      message: undefined as unknown as Message, // gán ngay bên dưới sau khi có reply
      embed: new EmbedBuilder(),
      track,
      lines: [],
      lastLine: null,
      plainShown: false,
      guildId,
      controlRows,
      createdAt: Date.now(),
      lyricsAttempted: false,
    };

    const embed = buildSessionEmbed(session, player, interaction.user);
    session.embed = embed;

    session.message = (await interaction.editReply({
      embeds: [embed],
      components: controlRows,
    })) as Message;

    activeSessions.set(guildId, session);

    startSessionTicker(session);

    const checkInterval = setInterval(async () => {
      const currentSession = activeSessions.get(guildId);
      if (!currentSession?.active) {
        clearInterval(checkInterval);
        return;
      }

      const currentPlayer = getPlayer(guildId);
      if (!currentPlayer?.isPlaying) {
        if (currentSession.lyricsInterval) clearInterval(currentSession.lyricsInterval);
        if (currentSession.progressInterval) clearInterval(currentSession.progressInterval);

        const stoppedEmbed = new EmbedBuilder()
          .setColor(COLORS.neutral)
          .setTitle("⏹️ Đã dừng phát nhạc")
          .setDescription("Live lyrics đã tắt tự động vì hết nhạc.")
          .setTimestamp();
        await currentSession.message
          .edit({ embeds: [stoppedEmbed], components: [] })
          .catch(() => {});
        activeSessions.delete(guildId);
        clearInterval(checkInterval);
      }
    }, 3000);

    session.checkInterval = checkInterval;
  },
};

export default cmd;
