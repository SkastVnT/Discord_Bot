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
  buildControlRow,
  successEmbed,
  warningEmbed,
  errorEmbed,
} from "../utils/embeds.js";
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
  controlRow?: ActionRowBuilder<ButtonBuilder>;
  progressInterval?: ReturnType<typeof setInterval>;
  lyricsInterval?: ReturnType<typeof setInterval>;
  checkInterval?: ReturnType<typeof setInterval>;
  createdAt: number;
  lyricsAttempted: boolean; // đã thử fallback chưa
}

export const activeSessions = new Map<string, LiveLyricsSession>();

// --------------- Fallback lyrics helpers ---------------

function extractVideoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignore */ }
  return null;
}

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
 * Chỉ còn một fallback duy nhất: caption timedtext của YouTube (có timestamp thật).
 * Nguồn AI sinh lời đã bị bỏ — lời bịa còn tệ hơn không có lời.
 * LRCLIB và lyrics.ovh do lyricsExt tự lo, không gọi lại ở đây.
 */
export async function attemptFallbackLyrics(session: LiveLyricsSession): Promise<void> {
  if (session.lyricsAttempted || session.lines.length > 0) return;
  session.lyricsAttempted = true;

  const { track } = session;
  console.log(`[lyrics] lrclib/ovh miss → trying YouTube captions for: ${track.title}`);

  const videoId = extractVideoIdFromUrl(track.url);
  if (videoId) {
    const captions = await fetchYouTubeCaptions(videoId);
    if (captions?.length) {
      session.timedLines = captions;
      session.lines = captions.map(l => l.text);
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
    const lyricsValue = session.timedLines?.length
      ? buildTimedCaptionsDisplay(session.timedLines, player.getTime().current)
      : buildLyricsDisplay(session.lines, true, false);
    freshEmbed.addFields({ name: "🎤 Lyrics", value: lyricsValue });
    freshEmbed.setFooter({ text: "🎵 /livelyrics off để tắt" });
    session.embed = freshEmbed;
    const components = session.controlRow ? [session.controlRow] : [];
    await session.message.edit({ embeds: [freshEmbed], components }).catch(() => {});
  } catch { /* ignore */ }
}

export function buildTimedCaptionsDisplay(timedLines: TimedLine[], positionMs: number): string {
  // Find the last line whose startMs <= current position
  let currentIdx = 0;
  for (let i = 0; i < timedLines.length; i++) {
    if (timedLines[i].startMs <= positionMs) {
      currentIdx = i;
    } else {
      break;
    }
  }
  // Show 2 lines before + current + 2 lines after
  const start = Math.max(0, currentIdx - 2);
  const end = Math.min(timedLines.length - 1, currentIdx + 2);
  let display = "";
  for (let i = start; i <= end; i++) {
    const line = timedLines[i].text;
    if (i === currentIdx) {
      display += `┃ **➤ ${line}**\n`;
    } else {
      display += `┃ *${line}*\n`;
    }
  }
  return display.trim();
}

export function buildLyricsDisplay(lines: string[], timedOut = false, isSearching = false): string {
  if (!lines.length) {
    if (isSearching) return "🔍 Đang tìm kiếm lyrics...";
    return timedOut
      ? "❌ Không tìm thấy lyrics cho bài này."
      : "⏳ Đang chờ lyrics...";
  }

  // Full lyrics mode (Gemini/YouTube captions): plain text, truncate to fit 1024 chars
  if (lines.length > 10) {
    const LIMIT = 1020;
    let result = "";
    let shown = 0;
    for (const line of lines) {
      const addition = line + "\n";
      if (result.length + addition.length > LIMIT - 20) {
        result += `*...(+${lines.length - shown} dòng nữa)*`;
        break;
      }
      result += addition;
      shown++;
    }
    return result.trim();
  }

  // Synced scroll mode (lrclib): last few lines with border
  let display = "";
  for (let i = 0; i < lines.length - 1; i++) {
    display += `┃ *${lines[i]}*\n`;
  }
  display += `┃ **➤ ${lines[lines.length - 1]}**`;
  return display;
}

function buildSessionEmbed(
  track: Track,
  player: ReturnType<typeof getPlayer>,
  lines: string[],
  requester?: { tag?: string; username?: string; displayAvatarURL?(opts?: { size?: number }): string } | null,
): EmbedBuilder {
  const embed = buildNowPlayingEmbed(track, player, requester ?? null);
  embed.addFields({ name: "🎤 Lyrics", value: buildLyricsDisplay(lines) });
  embed.setFooter({ text: "🎵 /livelyrics off để tắt" });
  return embed;
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
    const lines = plainText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!lines.length) return;
    session.plainShown = true;
    session.lines = lines;
    session.lastLine = lines[lines.length - 1] ?? null;
    console.log(
      `[lyrics] selected synced=false source=${lyricsPayload.provider ?? "?"} (lời thường, không có timestamp)`,
    );
  } else {
    return;
  }

  const currentPlayer = getPlayer(guildId);
  const freshEmbed = buildSessionEmbed(session.track, currentPlayer, session.lines);
  session.embed = freshEmbed;
  const components = session.controlRow ? [session.controlRow] : [];
  session.message.edit({ embeds: [freshEmbed], components }).catch(() => {});
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
    const controlRow = buildControlRow(player.isPaused, !!player.previousTrack);
    const embed = buildSessionEmbed(track, player, [], interaction.user);

    const message = (await interaction.editReply({
      embeds: [embed],
      components: [controlRow],
    })) as Message;

    const session: LiveLyricsSession = {
      active: true,
      message,
      embed,
      track,
      lines: [],
      lastLine: null,
      plainShown: false,
      guildId,
      controlRow,
      createdAt: Date.now(),
      lyricsAttempted: false,
    };
    activeSessions.set(guildId, session);

    session.progressInterval = setInterval(async () => {
      try {
        const currentPlayer = getPlayer(guildId);
        if (!currentPlayer?.isPlaying) {
          clearInterval(session.progressInterval);
          return;
        }
        const timedOut = Date.now() - session.createdAt > 12000;
        const isSearching = timedOut && !session.lyricsAttempted && session.lines.length === 0;
        if (timedOut && !session.lyricsAttempted) {
          attemptFallbackLyrics(session).catch(() => {}); // fire-and-forget
        }
        const freshEmbed = buildNowPlayingEmbed(session.track, currentPlayer);
        const lyricsValue = session.timedLines?.length
          ? buildTimedCaptionsDisplay(session.timedLines, currentPlayer.getTime().current)
          : buildLyricsDisplay(session.lines, timedOut, isSearching);
        freshEmbed.addFields({ name: "🎤 Lyrics", value: lyricsValue });
        freshEmbed.setFooter({ text: "🎵 /livelyrics off để tắt" });
        session.embed = freshEmbed;
        const components = session.controlRow ? [session.controlRow] : [];
        await session.message.edit({ embeds: [freshEmbed], components }).catch(() => {});
      } catch {
        // ignore
      }
    }, 5000);

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
