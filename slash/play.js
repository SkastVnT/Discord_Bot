import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { QueryType } from "discord-player";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Phát nhạc từ YouTube, Spotify, SoundCloud...")
    .addSubcommand(sub =>
      sub.setName("song")
        .setDescription("Phát một bài hát từ YouTube")
        .addStringOption(opt => opt.setName("url").setDescription("Đường dẫn YouTube").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("playlist")
        .setDescription("Phát playlist từ YouTube")
        .addStringOption(opt => opt.setName("url").setDescription("Đường dẫn playlist YouTube").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("search")
        .setDescription("Tìm kiếm bài hát theo tên")
        .addStringOption(opt => opt.setName("searchterms").setDescription("Tên bài hát").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("soundcloud")
        .setDescription("Phát bài hát từ SoundCloud")
        .addStringOption(opt => opt.setName("url").setDescription("URL SoundCloud").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("spotify")
        .setDescription("Phát bài hát từ Spotify")
        .addStringOption(opt => opt.setName("url").setDescription("URL Spotify").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("spotifyalbum")
        .setDescription("Phát playlist / album Spotify")
        .addStringOption(opt => opt.setName("url").setDescription("URL Spotify album / playlist").setRequired(true))
    ),

  async run({ client, interaction }) {
    try {
      const sub = interaction.options.getSubcommand();
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel)
        return interaction.reply({ content: "❌ Bạn cần vào voice channel trước!", ephemeral: true });

      await interaction.deferReply();

      // ✅ Tạo queue
      // ✅ Tạo hoặc lấy queue hiện có
      let queue = client.player.nodes.get(interaction.guildId);
      if (!queue) {
        queue = client.player.nodes.create(interaction.guild, {
          metadata: { channel: interaction.channel },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false, // Không tự out
          leaveOnEnd: false,
          leaveOnStop: false,
        });
      }

      if (!queue.connection) await queue.connect(voiceChannel);


      if (!queue.connection) await queue.connect(voiceChannel);

      let query;
      let searchEngine;

      switch (sub) {
        case "song":
          query = interaction.options.getString("url");
          searchEngine = QueryType.YOUTUBE_VIDEO;
          break;
        case "playlist":
          query = interaction.options.getString("url");
          searchEngine = QueryType.YOUTUBE_PLAYLIST;
          break;
        case "search":
          query = interaction.options.getString("searchterms");
          searchEngine = QueryType.YOUTUBE_SEARCH;
          break;
        case "soundcloud":
          query = interaction.options.getString("url");
          searchEngine = QueryType.SOUNDCLOUD_SEARCH;
          break;
        case "spotify":
          query = interaction.options.getString("url");
          searchEngine = QueryType.SPOTIFY_SEARCH;
          break;
        case "spotifyalbum":
          query = interaction.options.getString("url");
          searchEngine = QueryType.SPOTIFY_ALBUM;
          break;
        default:
          query = interaction.options.getString("url");
          searchEngine = QueryType.AUTO;
      }

      // ✅ Tìm nhạc
      const result = await client.player.search(query, {
        requestedBy: interaction.user,
        searchEngine,
      });

      if (!result || !result.tracks.length)
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");

      const embed = new EmbedBuilder().setColor(0x00ff99);

      // ✅ Playlist
      if (result.playlist) {
        queue.addTrack(result.tracks);
        embed
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(`**[${result.playlist.title}](${result.playlist.url})**`)
          .setThumbnail(result.playlist.thumbnail)
          .setFooter({ text: `${result.tracks.length} bài hát` });
      } else {
        const track = result.tracks[0];
        queue.addTrack(track);
        embed
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .setFooter({ text: `Thời lượng: ${track.duration}` });
      }

      // ✅ Phát nhạc
      if (!queue.isPlaying()) await queue.node.play();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("🚨 Lỗi phát nhạc:", err);
      await interaction.editReply("❌ Lỗi khi phát nhạc. Vui lòng thử lại.");
    }
  },
};
