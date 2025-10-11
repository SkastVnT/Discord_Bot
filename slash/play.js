import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager, getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Phát nhạc từ YouTube, Spotify, SoundCloud...")
    .addSubcommand((sub) =>
      sub
        .setName("song")
        .setDescription("Phát một bài hát từ YouTube")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("Đường dẫn YouTube")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("playlist")
        .setDescription("Phát playlist từ YouTube")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("Đường dẫn playlist YouTube")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("search")
        .setDescription("Tìm kiếm bài hát theo tên")
        .addStringOption((opt) =>
          opt
            .setName("searchterms")
            .setDescription("Tên bài hát")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("soundcloud")
        .setDescription("Phát bài hát từ SoundCloud")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("URL SoundCloud").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("spotify")
        .setDescription("Phát bài hát từ Spotify")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("URL Spotify").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("spotifyalbum")
        .setDescription("Phát playlist / album Spotify")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("URL Spotify album / playlist")
            .setRequired(true)
        )
    ),

  async run({ client, interaction }) {
    try {
      const sub = interaction.options.getSubcommand();
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel)
        return interaction.reply({
          content: "❌ Bạn cần vào voice channel trước!",
          ephemeral: true,
        });

      await interaction.deferReply();

      // ✅ Tạo queue
      // ✅ Tạo hoặc lấy queue hiện có
      let player = getPlayer(interaction.guildId);
      if (!player) {
        player = getManager().create(interaction.guildId, {
          userdata: {
            channel: interaction.channel,
          },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false, // Không tự out
          leaveOnEnd: false,
          leaveOnStop: false,
          extensions: ["lyricsExt"],
        });
      }

      if (!player.connection) await player.connect(voiceChannel);

      let query;
      let searchEngine;

      switch (sub) {
        case "song":
          query = interaction.options.getString("url");
          searchEngine = "youtube_video";
          break;
        case "playlist":
          query = interaction.options.getString("url");
          searchEngine = "youtube_playlist";
          break;
        case "search":
          query = interaction.options.getString("searchterms");
          searchEngine = "youtube_search";
          break;
        case "soundcloud":
          query = interaction.options.getString("url");
          searchEngine = "soundcloud_search";
          break;
        case "spotify":
          query = interaction.options.getString("url");
          searchEngine = "spotify_search";
          break;
        case "spotifyalbum":
          query = interaction.options.getString("url");
          searchEngine = "spotify_album";
          break;
        default:
          query = interaction.options.getString("url");
          searchEngine = "auto";
      }

      // ✅ Tìm nhạc
      const result = await player.search(query, interaction.user);

      if (!result || !result.tracks.length)
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");

      const embed = new EmbedBuilder().setColor(0x00ff99);

      // ✅ Playlist
      if (result.playlist) {
        player.insert(result.tracks, 0, interaction.user);
        embed
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(
            `**[${result.playlist.title}](${result.playlist.url})**`
          )
          .setThumbnail(result.playlist.thumbnail)
          .setFooter({ text: `${result.tracks.length} bài hát` });
      } else {
        const track = result.tracks?.[0];
        player.insert(track, 0, interaction.user);
        embed
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .setFooter({ text: `Thời lượng: ${track.duration}` });
      }

      // ✅ Phát nhạc
      if (!player.isPlaying) await player.play();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("🚨 Lỗi phát nhạc:", err);
      await interaction.editReply("❌ Lỗi khi phát nhạc. Vui lòng thử lại.");
    }
  },
};
