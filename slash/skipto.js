import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("⏩ Chuyển đến bài hát theo số thứ tự")
    .addNumberOption(option =>
      option
        .setName("tracknumber")
        .setDescription("Số thứ tự bài hát trong danh sách chờ")
        .setMinValue(1)
        .setRequired(true)
    ),

  async run({ client, interaction }) {
    const queue = client.player.nodes.get(interaction.guildId);

    if (!queue || !queue.tracks.size)
      return interaction.editReply("❌ Không có bài hát nào trong danh sách chờ!");

    const num = interaction.options.getNumber("tracknumber");
    if (num > queue.tracks.size)
      return interaction.editReply("⚠️ Số bài hát không hợp lệ!");

    await queue.node.skipTo(num - 1);
    const track = queue.currentTrack;

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setDescription(`⏩ Đã chuyển đến: **[${track.title}](${track.url})**`)
      .setThumbnail(track.thumbnail);

    await interaction.editReply({ embeds: [embed] });
  },
};
