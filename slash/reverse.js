import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("🔄 Đảo ngược thứ tự hàng chờ"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.queue.tracks.size) {
        return interaction.editReply("❌ Không có bài hát nào trong hàng chờ!");
      }

      const tracks = player.queue.tracks.toArray().reverse();
      
      // Xóa queue và thêm lại theo thứ tự đảo ngược
      player.queue.clear();
      player.queue.addMultiple(tracks);

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setDescription(
          `🔄 Đã đảo ngược **${tracks.length}** bài hát trong hàng chờ!`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh reverse:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi đảo ngược hàng chờ!");
    }
  },
};
