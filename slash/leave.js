import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("🚪 Cho bot rời khỏi voice channel"),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.connection) {
        return interaction.editReply("❌ Bot không ở trong voice channel nào!");
      }

      const voiceChannel = interaction.guild.members.cache.get(client.user.id)
        ?.voice.channel;
      const channelName = voiceChannel?.name || "voice channel";

      await player.disconnect();

      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(`🚪 Đã rời khỏi **${channelName}**!`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh leave:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi rời voice channel!");
    }
  },
};
