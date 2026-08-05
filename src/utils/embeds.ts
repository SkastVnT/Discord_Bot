import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbedField,
} from "discord.js";
import type { Track, Player, LoopMode } from "ziplayer";

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

/**
 * Tên nghệ sĩ của track.
 *
 * YouTubePlugin đặt tên kênh vào `metadata.author` và để trống `Track.author`,
 * nên đọc thẳng `track.author` sẽ luôn ra "Unknown" với nhạc YouTube.
 */
export function trackAuthor(track: Track, fallback = "Unknown"): string {
  const meta = track.metadata?.author;
  return track.author || (typeof meta === "string" ? meta : "") || fallback;
}

// ─── Duration Formatter (milliseconds → M:SS or H:MM:SS) ───────────────────
// ZiPlayer 0.3.x: Track.duration là số MILLISECOND (plugin tính length_seconds * 1000),
// và getTime().current/total cũng là ms. Vẫn nhận string để đỡ các chuỗi đã format sẵn.
export function formatDuration(raw: string | number | undefined | null): string {
  if (raw == null || raw === "") return "N/A";
  let ms: number;
  if (typeof raw === "string") {
    if (raw.includes(":")) return raw; // already formatted
    ms = Number(raw);
  } else {
    ms = raw;
  }
  if (!Number.isFinite(ms) || ms < 0) return "N/A";
  const t = Math.floor(ms / 1000);
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

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const BAR_SIZE = 20;
const BAR_FILLED = "━";
const BAR_KNOB = "●";
const BAR_EMPTY = "─";

/**
 * Thanh tiến trình dạng text, dùng thay `player.getProgressBar()`.
 *
 * Hàm của ziplayer tính `total` từ `track.duration`; với track lấy từ playlist/Mix
 * feed thì duration là NaN nên nó chỉ in ra con số thời gian trơ trọi, không có
 * thanh nào — đúng hiện tượng "Tiến trình 27:21" trong embed. Ở đây tách rõ ba
 * nhánh và nói thật khi không biết tổng thời lượng.
 *
 * Trả về text thuần; chỗ gọi tự bọc trong dấu ` để Discord render monospace.
 */
export function buildProgressBar(
  currentMs: number,
  totalMs: number | undefined | null,
  opts: { isLive?: boolean } = {},
): string {
  const current = Number.isFinite(currentMs) && currentMs > 0 ? currentMs : 0;

  if (opts.isLive) {
    // getTime() trả current = 0 cho live stream, khi đó không có gì để hiện thêm.
    return current > 0 ? `${BAR_KNOB} TRỰC TIẾP · ${formatDuration(current)}` : `${BAR_KNOB} TRỰC TIẾP`;
  }

  const total = Number(totalMs);
  if (!Number.isFinite(total) || total <= 0) {
    return `▸ đã phát ${formatDuration(current)} · không rõ tổng thời lượng`;
  }

  const ratio = Math.min(1, Math.max(0, current / total));
  const knobAt = Math.round(ratio * (BAR_SIZE - 1));
  let bar = "";
  for (let i = 0; i < BAR_SIZE; i++) {
    bar += i === knobAt ? BAR_KNOB : i < knobAt ? BAR_FILLED : BAR_EMPTY;
  }
  return `${bar}  ${formatDuration(current)} / ${formatDuration(total)}`;
}

// ─── Now Playing Embed ────────────────────────────────────────────────────────
/**
 * Embed "đang phát", dùng cho cả session live lyrics lẫn `/info`, `/skip`.
 *
 * Cố ý dùng thumbnail nhỏ chứ không phải ảnh lớn: embed này được vẽ lại liên tục
 * và có lyrics bên dưới, ảnh lớn 190px sẽ đẩy lyrics xuống tận cuối. Ảnh lớn dành
 * cho embed một lần "đã thêm vào hàng chờ" ở play.ts.
 *
 * Thanh tiến trình nằm trong description thay vì một field riêng, để nó nằm ngay
 * dưới tiêu đề và không tốn một dòng tên field.
 */
export function buildNowPlayingEmbed(
  track: Track,
  player?: Player | null,
  requester?: RequesterLike | null,
  opts: { note?: string } = {},
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(sourceColor(track.source))
    .setTitle(track.title)
    .setURL(track.url)
    .setAuthor({ name: trackAuthor(track, "Unknown Artist") })
    .setThumbnail(track.thumbnail ?? null);

  const isLive = player?.isLive ?? track.isLive ?? false;
  const time = player?.getTime?.();
  const progress = buildProgressBar(time?.current ?? 0, time?.total ?? track.duration, { isLive });

  embed.setDescription(opts.note ? `${opts.note}\n\`${progress}\`` : `\`${progress}\``);

  const fields: APIEmbedField[] = [
    { name: "📡 Nguồn", value: sourceLabel(track.source), inline: true },
  ];

  if (player) {
    if (player.volume != null) {
      fields.push({ name: "🔊 Âm lượng", value: `${player.volume}%`, inline: true });
    }

    const queueSize = player.queue?.size ?? 0;
    if (queueSize > 0) {
      fields.push({ name: "📜 Tiếp theo", value: `${queueSize} bài`, inline: true });
    }

    // Chỉ hiện khi đang bật, tránh thêm một field vô nghĩa vào trường hợp thường gặp.
    const mode = readLoopMode(player);
    if (mode !== "off") {
      fields.push({ name: "🔁 Lặp", value: loopLabel(mode), inline: true });
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

// ─── Loop mode helpers ────────────────────────────────────────────────────────
/**
 * Đọc chế độ lặp mà KHÔNG làm đổi nó.
 *
 * An toàn vì `Queue.loop(mode)` chỉ gán khi `mode` truthy: gọi không tham số là
 * đọc thuần. Đừng đổi sang cách khác mà không kiểm tra lại chỗ này.
 */
export function readLoopMode(player: Player): LoopMode {
  try {
    return player.loop() ?? "off";
  } catch {
    return "off";
  }
}

export function nextLoopMode(mode: LoopMode): LoopMode {
  if (mode === "off") return "track";
  if (mode === "track") return "queue";
  return "off";
}

export function loopLabel(mode: LoopMode): string {
  if (mode === "track") return "một bài";
  if (mode === "queue") return "cả hàng chờ";
  return "tắt";
}

// ─── Control Buttons ──────────────────────────────────────────────────────────
export const VOLUME_STEP = 10;

/**
 * Trần âm lượng cho UI. `player.setVolume()` thực tế nhận tới 200, nhưng trên 100
 * là khuếch đại và dễ rè; đổi hằng số này nếu muốn cho phép boost.
 */
export const VOLUME_MAX = 100;

/** customId của 8 nút điều khiển — khai cạnh chỗ dựng nút để hai bên không lệch. */
export const CONTROL_BUTTON_IDS: readonly string[] = [
  "ctrl_prev",
  "ctrl_pause",
  "ctrl_skip",
  "ctrl_stop",
  "ctrl_loop",
  "ctrl_shuffle",
  "ctrl_vol_down",
  "ctrl_vol_up",
];

export interface ControlState {
  isPaused: boolean;
  hasPrev: boolean;
  loopMode: LoopMode;
  volume: number;
  queueSize: number;
}

/** Gom trạng thái nút từ player, để 6 chỗ gọi không tự lắp tay mỗi nơi một kiểu. */
export function controlStateOf(player: Player): ControlState {
  return {
    isPaused: player.isPaused,
    hasPrev: !!player.previousTrack,
    loopMode: readLoopMode(player),
    volume: player.volume ?? VOLUME_MAX,
    queueSize: player.queue?.size ?? 0,
  };
}

/**
 * Hai hàng nút, 4 + 4 (Discord cho tối đa 5 nút một hàng).
 *
 * Hàng 1 điều khiển phát, hàng 2 chế độ và âm lượng. Volume có nút vì đây là
 * đường DUY NHẤT để đổi âm lượng — bot không có lệnh /volume, và volume bị cố
 * định 80 lúc tạo player. Còn queue/autoplay đã có lệnh riêng nên không chiếm ô.
 */
export function buildControlRows(state: ControlState): ActionRowBuilder<ButtonBuilder>[] {
  const playback = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_prev")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.hasPrev),
    new ButtonBuilder()
      .setCustomId("ctrl_pause")
      .setEmoji(state.isPaused ? "▶️" : "⏸️")
      .setStyle(state.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ctrl_skip")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ctrl_stop")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger),
  );

  const modes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ctrl_loop")
      // 🔂 = lặp một bài, 🔁 = lặp cả hàng chờ; nút sáng lên khi đang bật.
      .setEmoji(state.loopMode === "track" ? "🔂" : "🔁")
      .setStyle(state.loopMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ctrl_shuffle")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.queueSize < 2),
    new ButtonBuilder()
      .setCustomId("ctrl_vol_down")
      .setEmoji("🔉")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.volume <= 0),
    new ButtonBuilder()
      .setCustomId("ctrl_vol_up")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.volume >= VOLUME_MAX),
  );

  return [playback, modes];
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
