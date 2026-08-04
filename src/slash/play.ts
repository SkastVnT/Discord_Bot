import { SlashCommandBuilder, EmbedBuilder, type GuildMember, type Message } from "discord.js";
import { getManager, getPlayer } from "ziplayer";
import { activeSessions, buildLyricsDisplay, buildTimedCaptionsDisplay, attemptFallbackLyrics } from "./livelyrics.js";
import type { LiveLyricsSession } from "./livelyrics.js";
import {
  buildNowPlayingEmbed,
  buildControlRow,
  sourceColor,
  sourceLabel,
  formatDuration,
} from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

function extractYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (host.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "live") && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildYouTubeSearchCandidates(query: string): string[] {
  const candidates = [query];
  const videoId = extractYouTubeVideoId(query);
  if (!videoId) return candidates;

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const shortUrl = `https://youtu.be/${videoId}`;

  if (!candidates.includes(canonicalUrl)) candidates.push(canonicalUrl);
  if (!candidates.includes(shortUrl)) candidates.push(shortUrl);
  // NOTE: bare video ID intentionally NOT added — treated as text search by Lavalink → wrong song

  return candidates;
}

function isYouTubeUrl(query: string): boolean {
  try {
    const host = new URL(query).hostname.toLowerCase();
    return host === "youtu.be" || host.includes("youtube.com");
  } catch {
    return false;
  }
}

async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://youtu.be/${encodeURIComponent(videoId)}&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

async function searchWithFallback(
  player: ReturnType<typeof getPlayer>,
  query: string,
  requestedBy: unknown,
) {
  if (!player) return null;
  const candidates = buildYouTubeSearchCandidates(query);
  const videoId = extractYouTubeVideoId(query);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      if (candidate !== query) {
        console.log(`[play] Retry search with fallback candidate: ${candidate}`);
      }
      const result = await player.search(candidate, requestedBy);
      if (result?.tracks?.length) return result;
    } catch (err) {
      lastError = err;
      console.log(
        `[play] Search candidate failed: ${candidate} -> ${(err as Error).message}`,
      );
    }
  }

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
      let player = getPlayer(interaction.guildId!);
      if (!player) {
        player = await getManager().create(interaction.guildId!, {
          userdata: { channel: interaction.channel as import("discord.js").GuildTextBasedChannel | null },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
        });
      }

      if (!player.connection) await player.connect(voiceChannel);

      let query = interaction.options.getString("song", true);
      console.log(`🔍 Query: ${query}`);

      // Detect Spotify URL and convert to YouTube search
      const isSpotifyUrl =
        query.includes("spotify.com/track") ||
        query.includes("spotify.com/album") ||
        query.includes("spotify.com/playlist");

      if (isSpotifyUrl) {
        console.log("🎵 Detected Spotify URL, fetching metadata...");
        const spotifyResult = await player.search(query, interaction.user);
        if (spotifyResult?.tracks.length) {
          const spotifyMetadata = spotifyResult.tracks[0]!;
          const searchQuery =
            `${spotifyMetadata.title} ${spotifyMetadata.author || (spotifyMetadata.metadata?.author ?? "")}`.trim();
          console.log(`🔄 Converting Spotify to YouTube search: ${searchQuery}`);
          query = searchQuery;
        }
      }

      const result = await searchWithFallback(player, query, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const embed = new EmbedBuilder();

      if (result.playlist && result.tracks.length > 1) {
        const firstTrack = result.tracks[0]!;

        if (!player.isPlaying) {
          await player.play(firstTrack);
        } else {
          player.queue.add(firstTrack);
        }

        if (result.tracks.length > 1) {
          player.queue.addMultiple(result.tracks.slice(1));
        }

        embed
          .setColor(0x1db954)
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(
            `**[${result.playlist.title ?? "Mix Playlist"}](${result.playlist.url ?? query})**`,
          )
          .setThumbnail(result.playlist.thumbnail ?? firstTrack.thumbnail)
          .addFields(
            { name: "🎵 Số bài", value: `${result.tracks.length} bài`, inline: true },
            { name: "👤 Ca sĩ đầu tiên", value: firstTrack.author || "Unknown", inline: true },
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
      } else {
        const track = result.tracks[0]!;

        if (!player.isPlaying) {
          await player.play(track);
        } else {
          player.queue.add(track);
        }

        embed
          .setColor(sourceColor(track.source))
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .addFields(
            { name: "⏱️ Thời lượng", value: formatDuration(track.duration), inline: true },
            { name: "👤 Ca sĩ", value: track.author || "Unknown", inline: true },
            { name: "📡 Nguồn", value: sourceLabel(track.source), inline: true },
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
      }

      await interaction.editReply({ embeds: [embed] });

      // Auto-enable Live Info + Lyrics
      const guildId = interaction.guildId!;
      if (!activeSessions.has(guildId) && interaction.channel) {
        const track = result.tracks[0]!;
        const controlRow = buildControlRow(player.isPaused, !!player.previousTrack);
        const combinedEmbed = buildNowPlayingEmbed(track, player, interaction.user);
        combinedEmbed.addFields({ name: "🎤 Lyrics", value: "⏳ Đang tải lyrics..." });
        combinedEmbed.setFooter({ text: "🎵 /livelyrics off để tắt" });

        const combinedMsg = (await (interaction.channel as import("discord.js").GuildTextBasedChannel).send({
          embeds: [combinedEmbed],
          components: [controlRow],
        })) as Message;

        const session: LiveLyricsSession = {
          active: true,
          message: combinedMsg,
          embed: combinedEmbed,
          track,
          lines: [],
          lastLine: null,
          plainShown: false,
          guildId,
          controlRow,
          createdAt: Date.now(),
          lyricsAttempted: false,
        };

        session.progressInterval = setInterval(async () => {
          try {
            const currentPlayer = getPlayer(guildId);
            if (!currentPlayer?.isPlaying) {
              clearInterval(session.progressInterval);
              return;
            }
            const freshEmbed = buildNowPlayingEmbed(session.track, currentPlayer);
            const timedOut = Date.now() - session.createdAt > 12000;
            const isSearching = timedOut && !session.lyricsAttempted && session.lines.length === 0;
            if (timedOut && !session.lyricsAttempted) {
              attemptFallbackLyrics(session).catch(() => {});
            }
            const lyricsValue = session.timedLines?.length && currentPlayer.position !== undefined
              ? buildTimedCaptionsDisplay(session.timedLines, currentPlayer.position)
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

        activeSessions.set(guildId, session);
        console.log(`🎤 Auto Live Info+Lyrics enabled for guild: ${guildId}`);
      }
    } catch (err) {
      const isUserError = (err as Error).message === "YOUTUBE_URL_FAILED";
      if (isUserError) {
        console.warn("⚠️ URL YouTube không hợp lệ:", (err as Error).message);
      } else {
        console.error("🚨 Lỗi phát nhạc:", err);
      }
      const msg = isUserError
        ? "❌ Không thể phát URL YouTube này.\n💡 Kiểm tra lại link hoặc thử **tìm theo tên bài** thay vì dán link."
        : "❌ Đã xảy ra lỗi khi phát nhạc. Vui lòng thử lại!";
      await interaction.editReply(msg);
    }
  },
};

export default cmd;
