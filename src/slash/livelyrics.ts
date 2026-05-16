import { SlashCommandBuilder, EmbedBuilder, type Message } from "discord.js";
import { getPlayer } from "ziplayer";
import type { Track, LyricsPayload } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

// Bug fix #14: removed global.liveLyricsSessions and global.updateLiveLyricsFromExt
// Now uses clean module-level exports that are imported directly by index.ts and play.ts

export interface LiveLyricsSession {
  active: boolean;
  message: Message;
  embed: EmbedBuilder;
  track: Track;
  lines: string[];
  lastLine: string | null;
  plainShown: boolean;
  guildId: string;
  progressInterval?: ReturnType<typeof setInterval>;
  lyricsInterval?: ReturnType<typeof setInterval>;
  checkInterval?: ReturnType<typeof setInterval>;
}

export const activeSessions = new Map<string, LiveLyricsSession>();

function buildLyricsDisplay(lines: string[]): string {
  let display = "";
  for (let i = 0; i < lines.length - 1; i++) {
    display += `┃ *${lines[i]}*\n`;
  }
  if (lines.length > 0) {
    display += `┃ **➤ ${lines[lines.length - 1]}**`;
  }
  return display || "⏳ Đang chờ lyrics...";
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

  const currentLine = lyricsPayload?.current?.trim() ?? "";
  const plainText = lyricsPayload?.text?.trim() ?? "";

  if (currentLine) {
    if (session.lastLine === currentLine) return;
    session.lastLine = currentLine;
    session.lines.push(currentLine);
    if (session.lines.length > 6) session.lines.shift();

    session.embed.spliceFields(4, 1, {
      name: "🎤 Lyrics",
      value: buildLyricsDisplay(session.lines),
    });
    session.message.edit({ embeds: [session.embed] }).catch(() => {});
    return;
  }

  if (plainText && !session.plainShown) {
    const lines = plainText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!lines.length) return;

    session.plainShown = true;
    session.lines = lines;
    session.lastLine = lines[lines.length - 1] ?? null;

    session.embed.spliceFields(4, 1, {
      name: "🎤 Lyrics",
      value: buildLyricsDisplay(session.lines),
    });
    session.message.edit({ embeds: [session.embed] }).catch(() => {});
  }
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

    if (!player || !player.isPlaying) {
      return interaction.editReply("❌ Không có bài hát nào đang phát!");
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
        return interaction.editReply("⏹️ Đã tắt live lyrics!");
      }
      return interaction.editReply("❌ Live lyrics chưa được bật!");
    }

    if (activeSessions.has(guildId)) {
      return interaction.editReply(
        "⚠️ Live lyrics đang hoạt động! Dùng `/livelyrics off` để tắt.",
      );
    }

    const track = player.currentTrack!;

    const embed = new EmbedBuilder()
      .setColor("#FF6B6B")
      .setTitle(`🎶 ${track.title}`)
      .setURL(track.url)
      .setThumbnail(track.thumbnail)
      .addFields(
        { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
        { name: "⏱️ Thời lượng", value: String(track.duration ?? "N/A"), inline: true },
        { name: "📡 Nguồn", value: track.source ?? "youtube", inline: true },
        { name: "▶️ Tiến trình", value: "`0:00  ─────── 0:00`" },
        { name: "🎤 Lyrics", value: "⏳ Đang tải lyrics từ lyricsExt..." },
      )
      .setFooter({ text: "🎵 /livelyrics off để tắt" })
      .setTimestamp();

    const message = (await interaction.editReply({ embeds: [embed] })) as Message;

    const session: LiveLyricsSession = {
      active: true,
      message,
      embed,
      track,
      lines: [],
      lastLine: null,
      plainShown: false,
      guildId,
    };
    activeSessions.set(guildId, session);

    session.progressInterval = setInterval(async () => {
      try {
        const currentPlayer = getPlayer(guildId);
        if (!currentPlayer?.isPlaying) {
          clearInterval(session.progressInterval);
          return;
        }
        const newProgress =
          currentPlayer.getProgressBar?.({ timecodes: true, length: 15 }) ?? "";
        if (newProgress) {
          session.embed.spliceFields(3, 1, {
            name: "▶️ Tiến trình",
            value: `\`${newProgress}\``,
          });
          await session.message.edit({ embeds: [session.embed] }).catch(() => {});
        }
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
        currentSession.embed.spliceFields(4, 1, {
          name: "🎤 Lyrics",
          value: "⏹️ Bài hát đã dừng!",
        });
        currentSession.embed.setColor("#888888");
        await currentSession.message.edit({ embeds: [currentSession.embed] }).catch(() => {});
        activeSessions.delete(guildId);
        clearInterval(checkInterval);
      }
    }, 3000);

    session.checkInterval = checkInterval;
  },
};

export default cmd;
