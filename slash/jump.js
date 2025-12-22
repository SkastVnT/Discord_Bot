import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("jump")
    .setDescription("⏭️ Nhảy đến bài hát cụ thể trong hàng chờ")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Tên hoặc số thứ tự bài hát")
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong hàng chờ!");
      }

      const query = interaction.options.getString("query");
      const tracks = player.queue.tracks.toArray();

      // Thử parse số
      const num = parseInt(query);
      let targetIndex = -1;

      if (!isNaN(num) && num > 0 && num <= tracks.length) {
        targetIndex = num - 1;
      } else {
        // Tìm theo tên
        const lowerQuery = query.toLowerCase();
        targetIndex = tracks.findIndex((t) =>
          t.title.toLowerCase().includes(lowerQuery)
        );
      }

      if (targetIndex === -1) {
        return interaction.editReply(
          "❌ Không tìm thấy bài hát! Thử với số thứ tự hoặc tên chính xác hơn."
        );
      }

      await player.skip(targetIndex);
      const track = player.currentTrack;

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(
          `⏭️ Đã nhảy đến bài **#${targetIndex + 1}**:\n**[${track.title}](${track.url})**`
        )
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh jump:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi nhảy bài hát!");
    }
  },
};
