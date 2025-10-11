import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("⏭️ Bỏ qua bài hát hiện tại"),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.node.isPlaying()) {
      return interaction.editReply("❌ Không có bài hát nào để bỏ qua!");
    }

    const current = queue.currentTrack;
    await queue.node.skip();

    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setDescription(`⏭️ Đã bỏ qua: **${current.title}**`)
      .setThumbnail(current.thumbnail);

    await interaction.editReply({ embeds: [embed] });
  },
};
