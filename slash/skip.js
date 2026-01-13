import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("⏭️ Bỏ qua bài hát hiện tại"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào để bỏ qua!");
      }

      const current = player.currentTrack;
      await player.skip();

      const embed = new EmbedBuilder()
        .setColor("Orange")
        .setDescription(`⏭️ Đã bỏ qua: **${current.title}**`)
        .setThumbnail(current.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh skip:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi bỏ qua bài hát!");
    }
  },
};
