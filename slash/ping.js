import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Kiểm tra độ trễ của bot"),

  async run({ client, interaction }) {
    try {
      const startTime = Date.now();
      await interaction.editReply("🏓 Pong!");
      const endTime = Date.now();

      const botLatency = endTime - startTime;
      const apiLatency = Math.round(client.ws.ping);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🏓 Pong!")
        .addFields(
          {
            name: "⏱️ Bot Latency",
            value: `\`${botLatency}ms\``,
            inline: true,
          },
          {
            name: "📡 API Latency",
            value: `\`${apiLatency}ms\``,
            inline: true,
          }
        )
        .setFooter({ text: `Shard: ${client.ws.shards.size || 1}` })
        .setTimestamp();

      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh ping:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi kiểm tra ping!");
    }
  },
};
