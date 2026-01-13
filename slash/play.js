import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager, getPlayer } from "ziplayer";
import { activeSessions } from "./livelyrics.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("🎵 Phát nhạc (YouTube, Spotify - tự động detect)")
    .addStringOption((opt) =>
      opt
        .setName("song")
        .setDescription("Dán link hoặc nhập tên bài hát")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Bạn cần vào voice channel trước!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      let player = getPlayer(interaction.guildId);
      if (!player) {
        player = await getManager().create(interaction.guildId, {
          userdata: { channel: interaction.channel },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
          extensions: ["lyricsExt"],
        });
      }

      if (!player.connection) await player.connect(voiceChannel);

      let query = interaction.options.getString("song") || interaction.options.getString("query") || interaction.options.getString("url");
      console.log(`🔍 Query: ${query}`);

      if (!query) {
        return interaction.editReply("❌ Vui lòng nhập tên bài hát hoặc link!");
      }

      // Detect Spotify URL và convert sang YouTube search
      const isSpotifyUrl = query.includes("spotify.com/track") || query.includes("spotify.com/album") || query.includes("spotify.com/playlist");
      let spotifyMetadata = null;
      
      if (isSpotifyUrl) {
        console.log("🎵 Detected Spotify URL, fetching metadata...");
        const spotifyResult = await player.search(query, interaction.user);
        if (spotifyResult && spotifyResult.tracks.length > 0) {
          spotifyMetadata = spotifyResult.tracks[0];
          // Dùng tên bài + tác giả để search YouTube
          const searchQuery = `${spotifyMetadata.title} ${spotifyMetadata.author || spotifyMetadata.metadata?.author || ""}`.trim();
          console.log(`🔄 Converting Spotify to YouTube search: ${searchQuery}`);
          query = searchQuery;
        }
      }

      // Search và lấy kết quả (tự động detect URL/tên)
      const result = await player.search(query, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const embed = new EmbedBuilder().setColor(0x00ff99);

      // Xử lý playlist hoặc single track
      if (result.playlist && result.tracks.length > 1) {
        const firstTrack = result.tracks[0];

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
            `**[${result.playlist.title || "Mix Playlist"}](${result.playlist.url || query})**`
          )
          .setThumbnail(result.playlist.thumbnail || firstTrack.thumbnail)
          .setFooter({
            text: `${result.tracks.length} bài hát | Yêu cầu bởi ${interaction.user.tag}`,
          });
      } else {
        const track = result.tracks[0];

        if (!player.isPlaying) {
          await player.play(track);
        } else {
          player.queue.add(track);
        }

        embed
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .setFooter({
            text: `⏱️ ${track.duration} | 👤 ${track.author}`,
          });
      }

      await interaction.editReply({ embeds: [embed] });

      // Tự động bật Live Info + Lyrics
      const guildId = interaction.guildId;
      if (!activeSessions.has(guildId)) {
        const track = result.tracks[0];
        const progress =
          player?.getProgressBar?.({ timecodes: true, length: 15 }) ||
          "▶️ 0:00  advancement 0:00";

        const combinedEmbed = new EmbedBuilder()
          .setColor("#FF6B6B")
          .setTitle(`🎶 ${track.title}`)
          .setURL(track.url)
          .setThumbnail(track.thumbnail)
          .addFields(
            { name: "👤 Ca sĩ", value: track.author || "Không rõ", inline: true },
            { name: "⏱️ Thời lượng", value: String(track.duration || "N/A"), inline: true },
            { name: "📡 Nguồn", value: track.source || "youtube", inline: true }
          )
          .addFields({ name: "▶️ Tiến trình", value: `\`${progress}\`` })
          .addFields({ name: "🎤 Lyrics", value: "⏳ Đang chờ lyrics..." })
          .setFooter({ text: `🧍 ${interaction.user.tag} | /livelyrics off để tắt` })
          .setTimestamp();

        const combinedMsg = await interaction.channel.send({ embeds: [combinedEmbed] });

        const session = {
          active: true,
          message: combinedMsg,
          embed: combinedEmbed,
          track: track,
          lines: [],
          guildId: guildId,
        };

        session.progressInterval = setInterval(async () => {
          try {
            const currentPlayer = getPlayer(guildId);
            if (!currentPlayer || !currentPlayer.isPlaying) {
              clearInterval(session.progressInterval);
              return;
            }
            const newProgress =
              currentPlayer.getProgressBar?.({ timecodes: true, length: 15 }) || "";
            if (newProgress) {
              session.embed.spliceFields(3, 1, {
                name: "▶️ Tiến trình",
                value: `\`${newProgress}\``,
              });
              await session.message.edit({ embeds: [session.embed] }).catch(() => {});
            }
          } catch (e) {}
        }, 5000);

        activeSessions.set(guildId, session);
        console.log(`🎤 Auto Live Info+Lyrics enabled for guild: ${guildId}`);
      }
    } catch (err) {
      console.error("🚨 Lỗi phát nhạc:", err);
      await interaction.editReply(`❌ Lỗi: ${err.message}`);
    }
  },
};
