import { SlashCommandBuilder, EmbedBuilder, type GuildMember, type Message } from "discord.js";
import { getManager, getPlayer } from "ziplayer";
import { activeSessions } from "./livelyrics.js";
import type { LiveLyricsSession } from "./livelyrics.js";
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
  if (!candidates.includes(videoId)) candidates.push(videoId);

  return candidates;
}

async function searchWithFallback(
  player: ReturnType<typeof getPlayer>,
  query: string,
  requestedBy: unknown,
) {
  if (!player) return null;
  const candidates = buildYouTubeSearchCandidates(query);
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

      const embed = new EmbedBuilder().setColor(0x00ff99);

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
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(
            `**[${result.playlist.title ?? "Mix Playlist"}](${result.playlist.url ?? query})**`,
          )
          .setThumbnail(result.playlist.thumbnail ?? firstTrack.thumbnail)
          .setFooter({
            text: `${result.tracks.length} bài hát | Yêu cầu bởi ${interaction.user.tag}`,
          });
      } else {
        const track = result.tracks[0]!;

        if (!player.isPlaying) {
          await player.play(track);
        } else {
          player.queue.add(track);
        }

        embed
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .setFooter({ text: `⏱️ ${track.duration} | 👤 ${track.author}` });
      }

      await interaction.editReply({ embeds: [embed] });

      // Auto-enable Live Info + Lyrics
      const guildId = interaction.guildId!;
      if (!activeSessions.has(guildId) && interaction.channel) {
        const track = result.tracks[0]!;
        const progress =
          player.getProgressBar?.({ timecodes: true, length: 15 }) ?? "▶️ 0:00  ─────── 0:00";

        const combinedEmbed = new EmbedBuilder()
          .setColor("#FF6B6B")
          .setTitle(`🎶 ${track.title}`)
          .setURL(track.url)
          .setThumbnail(track.thumbnail)
          .addFields(
            { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
            { name: "⏱️ Thời lượng", value: String(track.duration ?? "N/A"), inline: true },
            { name: "📡 Nguồn", value: track.source ?? "youtube", inline: true },
          )
          .addFields({ name: "▶️ Tiến trình", value: `\`${progress}\`` })
          .addFields({ name: "🎤 Lyrics", value: "⏳ Đang tải lyrics từ lyricsExt..." })
          .setFooter({ text: `🧍 ${interaction.user.tag} | /livelyrics off để tắt` })
          .setTimestamp();

        const combinedMsg = (await (interaction.channel as import("discord.js").GuildTextBasedChannel).send({
          embeds: [combinedEmbed],
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
        };

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

        activeSessions.set(guildId, session);
        console.log(`🎤 Auto Live Info+Lyrics enabled for guild: ${guildId}`);
      }
    } catch (err) {
      // Bug fix #6: do not expose err.message to users
      console.error("🚨 Lỗi phát nhạc:", err);
      await interaction.editReply("❌ Đã xảy ra lỗi khi phát nhạc. Vui lòng thử lại!");
    }
  },
};

export default cmd;
