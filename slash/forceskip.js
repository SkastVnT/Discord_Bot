import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("forceskip")
    .setDescription("⏭️ Bỏ qua bài hát (chỉ admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const current = player.currentTrack;
      await player.skip();

      const embed = new EmbedBuilder()
        .setColor("Orange")
        .setDescription(
          `⏭️ **[Admin]** Đã force skip: **${current.title}**`
        )
        .setThumbnail(current.thumbnail);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh forceskip:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi force skip!");
    }
  },
};
