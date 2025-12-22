import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("previous")
    .setDescription("⏮️ Quay lại bài hát trước (alias của /back)"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const success = await player.previous();

      if (!success) {
        return interaction.editReply(
          "⚠️ Không có bài hát trước đó trong lịch sử!"
        );
      }

      const track = player.currentTrack;
      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(`⏮️ Quay lại: **${track.title}**`)
        .setThumbnail(track.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh previous:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi quay lại bài hát trước!");
    }
  },
};
