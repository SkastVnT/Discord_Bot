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
          opt.setName("url").setDescription("Đường dẫn YouTube").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("playlist")
        .setDescription("Phát playlist từ YouTube")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("Đường dẫn playlist YouTube").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("search")
        .setDescription("Tìm kiếm bài hát theo tên")
        .addStringOption((opt) =>
          opt.setName("searchterms").setDescription("Tên bài hát").setRequired(true)
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
          opt.setName("url").setDescription("URL Spotify album / playlist").setRequired(true)
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

      let query = interaction.options.getString("url") || interaction.options.getString("searchterms");

      console.log(`🔍 Query: ${query}, Subcommand: ${sub}`);

      // Search và lấy kết quả
      const result = await player.search(query, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      console.log(`📊 Result type: ${result.playlist ? 'Playlist' : 'Single'}`);
      if (result.playlist) {
        console.log(`📀 Playlist: "${result.playlist.title}" with ${result.tracks.length} tracks`);
      } else {
        console.log(`🎵 Single track: "${result.tracks[0].title}"`);
      }

      const embed = new EmbedBuilder().setColor(0x00ff99);

      // Xử lý playlist hoặc single track
      if (result.playlist && result.tracks.length > 1) {
        // Playlist: phát bài đầu và add phần còn lại vào queue
        const firstTrack = result.tracks[0];
        
        // Nếu đang không phát gì, phát bài đầu tiên
        if (!player.isPlaying) {
          await player.play(firstTrack);
        } else {
          // Nếu đang phát, add vào queue
          player.queue.add(firstTrack);
        }

        // Add các bài còn lại vào queue
        if (result.tracks.length > 1) {
          player.queue.addMultiple(result.tracks.slice(1));
        }

        embed
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(`**[${result.playlist.title || "Mix Playlist"}](${result.playlist.url || query})**`)
          .setThumbnail(result.playlist.thumbnail || firstTrack.thumbnail)
          .setFooter({ 
            text: `${result.tracks.length} bài hát | Yêu cầu bởi ${interaction.user.tag}` 
          });

      } else {
        // Single track
        const track = result.tracks[0];
        
        if (!player.isPlaying) {
          await player.play(track);
        } else {
          player.queue.add(track);
        }

      const fallstatus = await player.play(result.tracks[0]);
      if (!fallstatus) return interaction.editReply("❌ Không thể phát nhạc!");

      if (result.playlist) {
        // ✅ sửa phần này: hiển thị số lượng bài bằng result.tracks.length
        player.queue.addMultiple(result.tracks.slice(1));
        embed
          .setTitle("📀 Playlist đã thêm vào hàng chờ")
          .setDescription(`**[${result.playlist.title}](${result.playlist.url})**`)
          .setThumbnail(result.playlist.thumbnail)
          .setFooter({ text: `${result.tracks.length} bài hát trong playlist` });
      } else {
        const track = result.tracks?.[0];
        embed
          .setTitle("🎶 Đã thêm vào hàng chờ")
          .setDescription(`**[${track.title}](${track.url})**`)
          .setThumbnail(track.thumbnail)
          .setFooter({ 
            text: `⏱️ ${track.duration} | 👤 ${track.author}` 
          });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("🚨 Lỗi phát nhạc:", err);
      await interaction.editReply(`❌ Lỗi: ${err.message}`);
    }
  },
};
