import { getManager, getPlayer } from "ziplayer";
import { lyricsExt } from "@ziplayer/extension";
import type { Player } from "ziplayer";
import type { GuildTextBasedChannel, VoiceBasedChannel } from "discord.js";

/**
 * Tạo một instance lyricsExt RIÊNG cho mỗi player.
 *
 * ZiPlayer 0.3.x activate toàn bộ extension mức PlayerManager khi create() không
 * truyền `extensions`, nghĩa là mọi guild sẽ dùng chung một instance — mà lyricsExt
 * giữ state theo track/player (schedules) nên sẽ lẫn lyrics giữa các server.
 * Vì vậy manager không khai extension nào, mỗi player tự mang instance của mình.
 */
function createLyricsExtension(): lyricsExt {
  return new lyricsExt(null, {
    provider: "lrclib",
    includeSynced: true,
    autoFetchOnTrackStart: true,
    sanitizeTitle: true,
    maxLength: 32_000,
  });
}

/**
 * Lấy player của guild, tạo mới nếu chưa có. Đây là đường tạo player duy nhất
 * của bot để `/play` và `/playlocal` không bị lệch cấu hình.
 */
export async function ensurePlayer(
  guildId: string,
  channel: GuildTextBasedChannel | null,
): Promise<Player> {
  const existing = getPlayer(guildId);
  if (existing) return existing;

  const manager = getManager();
  if (!manager) throw new Error("PLAYER_MANAGER_NOT_READY");

  const player = await manager.create(guildId, {
    userdata: { channel },
    selfDeaf: true,
    volume: 80,
    leaveOnEmpty: false,
    leaveOnEnd: false,
    extensions: [createLyricsExtension()],
  });

  console.log(`[lyrics] extension activated guild=${guildId}`);
  return player;
}

/**
 * Có bài nào đang phát HOẶC đang tạm dừng.
 *
 * Dùng cái này cho các lệnh thay vì `player.isPlaying`: isPlaying của ziplayer là
 * `status === Playing || Buffering`, tức là FALSE khi đang pause. Dùng isPlaying
 * làm điều kiện "không có nhạc" sẽ khiến /skip, /queue, /info… báo là không có bài
 * nào đang phát trong lúc chỉ đang tạm dừng.
 */
export function hasActiveTrack(player?: Player | null): player is Player {
  return Boolean(player?.currentTrack);
}

/** Player đang có việc: phát, buffer, hoặc tạm dừng giữa bài. */
export function isBusy(player?: Player | null): boolean {
  return Boolean(player && (player.isPlaying || player.isPaused));
}

/** Nối player vào voice channel nếu chưa nối. */
export async function ensureConnected(
  player: Player,
  voiceChannel: VoiceBasedChannel,
): Promise<void> {
  if (player.connection) return;
  // ZiPlayer khai VoiceChannel còn member.voice.channel là VoiceBasedChannel
  // (gồm cả StageChannel) — runtime chỉ cần channel id + guild nên cast an toàn.
  await player.connect(voiceChannel as Parameters<Player["connect"]>[0]);
}
