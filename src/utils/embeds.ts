import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbedField,
} from "discord.js";
import type { Track, Player } from "ziplayer";

// ─── Brand Colors ─────────────────────────────────────────────────────────────
export const COLORS = {
  youtube:    0xff0000,
  spotify:    0x1db954,
  soundcloud: 0xff5500,
  primary:    0xff6b6b,
  success:    0x57f287,
  error:      0xed4245,
  warning:    0xfee75c,
  info:       0x5865f2,
  queue:      0x9b59b6,
  lyrics:     0x2ecc71,
  neutral:    0x36393f,
} as const;

// ─── Source Helpers ───────────────────────────────────────────────────────────
export function sourceColor(source?: string): number {
  switch (source) {
    case "youtube":
    case "ytsr":       return COLORS.youtube;
    case "spotify":    return COLORS.spotify;
    case "soundcloud": return COLORS.soundcloud;
    default:           return COLORS.primary;
  }
}

export function sourceLabel(source?: string): string {
  switch (source) {
    case "youtube":
    case "ytsr":       return "YouTube";
    case "spotify":    return "Spotify";
    case "soundcloud": return "SoundCloud";
    default:           return "Nhạc";
  }
}

export function isYouTube(source?: string): boolean {
  return !source || source === "youtube" || source === "ytsr";
}

// ─── Duration Formatter (seconds → M:SS or H:MM:SS) ────────────────────────
export function formatDuration(raw: string | number | undefined | null): string {
  if (raw == null || raw === "") return "N/A";
  let seconds: number;
  if (typeof raw === "string") {
    if (raw.includes(":")) return raw; // already formatted
    seconds = Number(raw);
  } else {
    seconds = raw;
  }
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  const t = Math.floor(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Requester shape (compatible with discord.js User) ───────────────────────
export interface RequesterLike {
  tag?: string;
  username?: string;
  displayAvatarURL?(opts?: { size?: number }): string;
}

// ─── Now Playing Embed ────────────────────────────────────────────────────────
// YouTube → wide banner .setImage(); other sources → square .setThumbnail()
export function buildNowPlayingEmbed(
  track: Track,
  player?: Player | null,
  requester?: RequesterLike | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(sourceColor(track.source))
    .setTitle(track.title)
    .setURL(track.url)
    .setAuthor({ name: track.author || "Unknown Artist" });

  if (isYouTube(track.source)) {
    embed.setImage(track.thumbnail ?? null);
  } else {
    embed.setThumbnail(track.thumbnail ?? null);
  }

  const fields: APIEmbedField[] = [
    { name: "⏱️ Thời lượng", value: formatDuration(track.duration), inline: true },
    { name: "📡 Nguồn",       value: sourceLabel(track.source), inline: true },
  ];

  if (player) {
    const queueSize = player.queue?.tracks?.size ?? 0;
    if (queueSize > 0) {
      fields.push({ name: "📜 Tiếp theo", value: `${queueSize} bài`, inline: true });
    }

    const progress = player.getProgressBar?.({ timecodes: true, length: 16 });
    if (progress && typeof progress === "string" && progress.trim()) {
      fields.push({ name: "▶ Tiến trình", value: `\`${progress}\``, inline: false });
    }

    if (player.volume != null) {
      fields.push({ name: "🔊 Âm lượng", value: `${player.volume}%`, inline: true });
    }
  }

  embed.addFields(fields);

  const name = requester?.tag ?? requester?.username;
  embed
    .setFooter({
      text: name ? `Yêu cầu bởi ${name}` : `🎵 ${sourceLabel(track.source)}`,
      iconURL: requester?.displayAvatarURL?.({ size: 32 }) ?? undefined,
    })
    .setTimestamp();

  return embed;
}

// ─── Control Buttons ⏮⏸⏭⏹ ──────────────────────────────────────────────────
export function buildControlRow(
  isPaused: boolean,
  hasPrev: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_prev")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPrev),
    new ButtonBuilder()
      .setCustomId("ctrl_pause")
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ctrl_skip")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_stop")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Queue Page Buttons ───────────────────────────────────────────────────────
export function buildQueuePageRow(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ctrl_queue_${page - 1}`)
      .setLabel("◀ Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("ctrl_queue_label")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`ctrl_queue_${page + 1}`)
      .setLabel("Tiếp ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

// ─── Lyrics Page Buttons ──────────────────────────────────────────────────────
export function buildLyricsPageRow(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ctrl_lyr_${page - 1}`)
      .setLabel("◀ Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("ctrl_lyr_label")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`ctrl_lyr_${page + 1}`)
      .setLabel("Tiếp ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

// ─── Mini Embeds ─────────────────────────────────────────────────────────────
export function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${msg}`);
}

export function successEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ ${msg}`);
}

export function warningEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.warning).setDescription(`⚠️ ${msg}`);
}

export function infoEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.info).setDescription(`ℹ️ ${msg}`);
}
