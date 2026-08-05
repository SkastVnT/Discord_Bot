import {
  SlashCommandBuilder,
  EmbedBuilder,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { getPlayer } from "ziplayer";
import type { Player, Track } from "ziplayer";
import { ensurePlayer, ensureConnected, isBusy } from "../utils/player.js";
import { activeSessions, startSessionTicker, addLyricsField } from "./livelyrics.js";
import type { LiveLyricsSession } from "./livelyrics.js";
import {
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
import {
  extractYouTubeListId,
  isYouTubeMix,
  buildYouTubeSearchCandidates,
  extractYouTubeVideoId,
  fetchYouTubeTitle,
  looksLikeCompilation,
} from "../utils/youtube.js";
import type { SlashCommand } from "../types/command.js";

// Các helper URL YouTube đã chuyển sang src/utils/youtube.ts — livelyrics.ts và
// trackRepair.ts dùng chung, trước đây mỗi file tự có một bản hơi khác nhau.

/**
 * Ảnh cho embed xác nhận "đã thêm vào hàng chờ".
 *
 * YouTube có thumbnail ngang 16:9 nên để ảnh lớn mới đúng khung; nguồn khác thường
 * là bìa vuông, để ảnh lớn sẽ bị crop nên dùng thumbnail bên phải.
 */
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
function dropCompilations(tracks: Track[]): { tracks: Track[]; droppedCount: number } {
  const kept = tracks.filter((t) => !looksLikeCompilation(t.title));
  if (kept.length < 2) {
    console.log(`[play] bỏ qua bước lọc: chỉ còn ${kept.length}/${tracks.length} bài sau khi lọc`);
    return { tracks, droppedCount: 0 };
  }
  const droppedCount = tracks.length - kept.length;
  if (droppedCount > 0) {
    console.log(`[play] đã lọc ${droppedCount}/${tracks.length} video tổng hợp khỏi playlist`);
    for (const t of tracks.filter((x) => looksLikeCompilation(x.title))) {
      console.log(`[play]   bỏ: ${t.title}`);
    }
  }
  return { tracks: kept, droppedCount };
}

function setArtwork(embed: EmbedBuilder, url: string | null | undefined, source?: string): void {
  if (!url) return;
  if (isYouTube(source)) embed.setImage(url);
  else embed.setThumbnail(url);
}

async function searchWithFallback(
  player: Player,
  query: string,
  requestedBy: string,
) {
  const candidates = buildYouTubeSearchCandidates(query);
  const videoId = extractYouTubeVideoId(query);
  const wantMix = isYouTubeMix(query);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      if (candidate !== query) {
        console.log(`[play] Retry search with fallback candidate: ${candidate}`);
      }
      const result = await player.search(candidate, requestedBy);

      console.log("[play debug]", {
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
        console.warn(`[play] YouTube Mix degraded to a single track: ${candidate}`);
        continue;
      }

      return result;
    } catch (err) {
      lastError = err;
      console.log(
        `[play] Search candidate failed: ${candidate} -> ${(err as Error).message}`,
      );
    }
  }

  // Mix không được hạ cấp sang tìm-theo-tên: đó chính là đường tạo ra queue sai.
  if (wantMix) throw new Error("YOUTUBE_MIX_DEGRADED");

  // Tất cả URL forms đều fail → thử fetch title qua oEmbed rồi search theo tên
  if (videoId) {
    console.log(`[play] All URL variants failed, fetching title via oEmbed for: ${videoId}`);
    const title = await fetchYouTubeTitle(videoId);
    if (title) {
      console.log(`[play] oEmbed title: "${title}", searching by title...`);
      try {
        const result = await player.search(title, requestedBy);
        if (result?.tracks?.length) return result;
      } catch (err) {
        console.log(`[play] Title search also failed: ${(err as Error).message}`);
      }
    } else {
      console.log(`[play] oEmbed returned no title (invalid video ID or network error)`);
    }
    // oEmbed did not help → throw a user-friendly error instead of raw Lavalink error
    throw new Error("YOUTUBE_URL_FAILED");
  }

  if (lastError) throw lastError;
  return null;
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
      const isSpotifyUrl =
        query.includes("spotify.com/track") ||
        query.includes("spotify.com/album") ||
        query.includes("spotify.com/playlist");

      if (isSpotifyUrl) {
        console.log("🎵 Detected Spotify URL, fetching metadata...");
        const spotifyResult = await player.search(query, interaction.user.id);
        if (spotifyResult?.tracks.length) {
          const spotifyMetadata = spotifyResult.tracks[0]!;
          const searchQuery =
            `${spotifyMetadata.title} ${spotifyMetadata.author || (spotifyMetadata.metadata?.author ?? "")}`.trim();
          console.log(`🔄 Converting Spotify to YouTube search: ${searchQuery}`);
          query = searchQuery;
        }
      }

      const result = await searchWithFallback(player, query, interaction.user.id);

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

      // Auto-enable Live Info + Lyrics
      const guildId = interaction.guildId!;
      if (!activeSessions.has(guildId) && interaction.channel) {
        const track = result.tracks[0]!;
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
