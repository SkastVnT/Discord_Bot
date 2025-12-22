import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("playnext")
    .setDescription("➕ Thêm bài hát vào vị trí tiếp theo trong hàng chờ")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Link hoặc tên bài hát")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.editReply(
          "❌ Bạn cần vào voice channel trước!"
        );
      }

      await interaction.editReply("🔍 Đang tìm bài hát...");

      const player = getPlayer(interaction.guildId);
      if (!player) {
        return interaction.editReply("❌ Không có player nào!");
      }

      const query = interaction.options.getString("url");
      const result = await player.search(query, interaction.user);

      if (!result || !result.tracks.length) {
        return interaction.editReply("❌ Không tìm thấy kết quả nào!");
      }

      const track = result.tracks[0];
      
      // Thêm vào đầu queue
      player.queue.insert(track, 0);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("➕ Đã thêm vào vị trí tiếp theo")
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .setFooter({ text: `⏱️ ${track.duration} | 👤 ${track.author}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh playnext:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi thêm bài hát!");
    }
  },
};
