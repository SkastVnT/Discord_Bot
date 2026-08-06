import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import type { Player, Track } from "ziplayer";
import { ensurePlayer, ensureConnected, isBusy } from "../utils/player.js";
import {
  searchWithFallback,
  dropCompilations,
  previewPlaylist,
} from "../services/playlistImport.js";
import { isSpotifyUrl } from "../utils/spotify.js";
import { formatMs } from "../utils/duration.js";
import { activeSessions, startSessionTicker, addLyricsField } from "./livelyrics.js";
import type { LiveLyricsSession } from "./livelyrics.js";
import {
  COLORS,
  buildNowPlayingEmbed,
  buildControlRows,
  controlStateOf,
  sourceColor,
  sourceLabel,
  formatDuration,
  trackAuthor,
  trackThumbnail,
  isYouTube,
} from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

// Các helper URL YouTube đã chuyển sang src/utils/youtube.ts — livelyrics.ts và
// trackRepair.ts dùng chung, trước đây mỗi file tự có một bản hơi khác nhau.
//
// `searchWithFallback` và `dropCompilations` đã chuyển sang services/playlistImport.ts
// để `/playlist import` dùng chung đúng một cách xử lý Mix và một bộ lọc video tổng hợp.

/**
 * Ảnh cho embed xác nhận "đã thêm vào hàng chờ".
 *
 * YouTube có thumbnail ngang 16:9 nên để ảnh lớn mới đúng khung; nguồn khác thường
 * là bìa vuông, để ảnh lớn sẽ bị crop nên dùng thumbnail bên phải.
 */
function setArtwork(embed: EmbedBuilder, url: string | null | undefined, source?: string): void {
  if (!url) return;
  if (isYouTube(source)) embed.setImage(url);
  else embed.setThumbnail(url);
}

/** URL video YouTube → Track của ZiPlayer. */
async function resolveYouTubeUrl(
  player: Player,
  url: string,
  requestedBy: string,
): Promise<Track | null> {
  try {
    const result = await player.search(url, requestedBy);
    return result?.tracks?.[0] ?? null;
  } catch (err) {
    console.warn(`[play] không resolve được ${url}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Bật panel đang phát + lyrics nếu guild chưa có.
 *
 * Tách ra vì cả đường YouTube lẫn đường Spotify đều cần; trước đây khối này nằm
 * inline ở cuối run() nên nhánh Spotify sẽ không có panel.
 */
async function startLiveSession(
  interaction: ChatInputCommandInteraction,
  player: Player,
): Promise<void> {
  const guildId = interaction.guildId!;
  if (activeSessions.has(guildId) || !interaction.channel) return;

  const track = player.currentTrack;
  if (!track) return;

  const controlRows = buildControlRows(controlStateOf(player));
  const session: LiveLyricsSession = {
    active: true,
    message: undefined as unknown as Message, // gán ngay sau khi gửi
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

  const combinedEmbed = buildNowPlayingEmbed(track, player, interaction.user);
  addLyricsField(combinedEmbed, session, player);
  session.embed = combinedEmbed;

  session.message = (await (interaction.channel as GuildTextBasedChannel).send({
    embeds: [combinedEmbed],
    components: controlRows,
  })) as Message;

  startSessionTicker(session);
  activeSessions.set(guildId, session);
  console.log(`🎤 Auto Live Info+Lyrics enabled for guild: ${guildId}`);
}

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("🎵 Phát nhạc (YouTube, Spotify - tự động detect)")
    .addStringOption((opt) =>
      opt
        .setName("song")
        .setDescription("Dán link hoặc nhập tên bài hát")
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    // Bug fix #12: removed dead getString("query"/"url") fallbacks (always null)
    // Bug fix #6: removed err.message exposure → generic error message
    const voiceChannel = (interaction.member as GuildMember)?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Bạn cần vào voice channel trước!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const player = await ensurePlayer(
        interaction.guildId!,
        interaction.channel as GuildTextBasedChannel | null,
      );
      await ensureConnected(player, voiceChannel);

      let query = interaction.options.getString("song", true);
      console.log(`🔍 Query: ${query}`);

      // Detect Spotify URL and convert to YouTube search
      // ── Spotify ────────────────────────────────────────────────────────────
      // Spotify không cho stream nên phải khớp sang YouTube. Đường cũ ở đây gọi
      // `player.search(<link spotify>)` mà không có plugin Spotify nào được đăng
      // ký, nên nó rơi xuống tìm-theo-tên với nguyên cái URL — không bao giờ ra
      // đúng bài. Giờ dùng Spotify Web API thật.
      if (isSpotifyUrl(query)) {
        const preview = await previewPlaylist(query, interaction.user.id);
        const tracks = preview.tracks;
        console.log(`🎵 Spotify → ${tracks.length} bài đã khớp YouTube`);

        const first = await resolveYouTubeUrl(player, tracks[0]!.url, interaction.user.id);
        if (!first) return interaction.editReply("❌ Không phát được bài này.");

        if (!isBusy(player)) await player.play(first);
        else player.queue.add(first);

        const embed = new EmbedBuilder()
          .setColor(COLORS.spotify)
          .setTitle(tracks.length > 1 ? "🟢 Đã thêm từ Spotify" : "🟢 Đã thêm vào hàng chờ")
          .setDescription(
            tracks.length > 1
              ? `**${preview.source.title ?? "Spotify"}** — ${tracks.length} bài`
              : `**[${tracks[0]!.title}](${tracks[0]!.url})**`,
          )
          .addFields(
            { name: "⏱️ Thời lượng", value: formatMs(tracks[0]!.durationMs), inline: true },
            { name: "👤 Ca sĩ", value: tracks[0]!.author ?? "—", inline: true },
            { name: "📡 Nguồn", value: "Spotify → YouTube", inline: true },
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });

        if (preview.droppedCount > 0) {
          embed.addFields({
            name: "⚠️ Không khớp được",
            value: `${preview.droppedCount} bài không tìm thấy trên YouTube`,
          });
        }
        setArtwork(embed, tracks[0]!.thumbnail, "spotify");
        await interaction.editReply({ embeds: [embed] });

        // Nạp phần còn lại ở nền để nhạc kêu ngay, không bắt chờ khớp hết cả album.
        if (tracks.length > 1) {
          void (async () => {
            for (const track of tracks.slice(1)) {
              const resolved = await resolveYouTubeUrl(player, track.url, interaction.user.id);
              if (resolved) player.queue.add(resolved);
            }
            console.log(`🎵 Spotify: đã nạp xong ${tracks.length} bài`);
          })();
        }

        await startLiveSession(interaction, player);
        return;
      }

      const result = await searchWithFallback(
        (q, by) => player.search(q, by),
        query,
        interaction.user.id,
      );

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const embed = new EmbedBuilder();

      if (result.playlist && result.tracks.length > 1) {
        const { tracks, droppedCount } = dropCompilations(result.tracks);
        const firstTrack = tracks[0]!;

        // isBusy tính cả trạng thái pause: nếu chỉ xét isPlaying thì /play lúc đang
        // tạm dừng sẽ gọi play() và cướp chỗ bài đang dở thay vì thêm vào hàng chờ.
        if (!isBusy(player)) {
          await player.play(firstTrack);
        } else {
          player.queue.add(firstTrack);
        }

        if (tracks.length > 1) {
          player.queue.addMultiple(tracks.slice(1));
        }

        embed
          .setColor(0x1db954)
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(
            `**[${result.playlist.name ?? "Mix Playlist"}](${result.playlist.url ?? query})**`,
          )
          .addFields(
            { name: "🎵 Số bài", value: `${tracks.length} bài`, inline: true },
            { name: "👤 Ca sĩ đầu tiên", value: trackAuthor(firstTrack), inline: true },
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });

        // Nói rõ đã bỏ bao nhiêu, không âm thầm cắt bớt.
        if (droppedCount > 0) {
          embed.addFields({
            name: "🧹 Đã lọc",
            value: `${droppedCount} video tổng hợp (playlist, full album, bản 1 tiếng)`,
            inline: false,
          });
        }

        // Embed này gửi một lần rồi thôi (không kèm lyrics như embed session),
        // nên dùng ảnh lớn cho đẹp thay vì thumbnail bé.
        setArtwork(embed, result.playlist.thumbnail ?? trackThumbnail(firstTrack), firstTrack.source);
      } else {
        const track = result.tracks[0]!;

        // isBusy tính cả trạng thái pause: nếu chỉ xét isPlaying thì /play lúc đang
        // tạm dừng sẽ gọi play() và cướp chỗ bài đang dở thay vì thêm vào hàng chờ.
        if (!isBusy(player)) {
          await player.play(track);
        } else {
          player.queue.add(track);
        }

        embed
          .setColor(sourceColor(track.source))
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .addFields(
            { name: "⏱️ Thời lượng", value: formatDuration(track.duration), inline: true },
            { name: "👤 Ca sĩ", value: trackAuthor(track), inline: true },
            { name: "📡 Nguồn", value: sourceLabel(track.source), inline: true },
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });

        setArtwork(embed, trackThumbnail(track), track.source);
      }

      await interaction.editReply({ embeds: [embed] });

      await startLiveSession(interaction, player);
    } catch (err) {
      const code = (err as Error).message;
      let msg: string;

      if (code === "YOUTUBE_MIX_DEGRADED") {
        console.warn("⚠️ YouTube không trả về Mix thật cho link này");
        msg =
          "❌ YouTube không trả về danh sách Mix cho link này (chỉ có đúng 1 bài).\n" +
          "💡 Thử lại sau, hoặc dán link playlist thường (`list=PL...`), hoặc tìm theo tên bài.\n" +
          "*Bot không tự phát một bài rồi nối nhạc cùng tác giả nữa.*";
      } else if (code === "YOUTUBE_URL_FAILED") {
        console.warn("⚠️ URL YouTube không hợp lệ:", code);
        msg =
          "❌ Không thể phát URL YouTube này.\n💡 Kiểm tra lại link hoặc thử **tìm theo tên bài** thay vì dán link.";
      } else if (code === "PLAYER_MANAGER_NOT_READY") {
        console.error("🚨 PlayerManager chưa khởi tạo");
        msg = "❌ Bot chưa sẵn sàng phát nhạc. Thử lại sau vài giây!";
      } else {
        console.error("🚨 Lỗi phát nhạc:", err);
        msg = "❌ Đã xảy ra lỗi khi phát nhạc. Vui lòng thử lại!";
      }

      await interaction.editReply(msg);
    }
  },
};

export default cmd;
