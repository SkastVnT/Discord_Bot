import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { COLORS, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Kiểm tra độ trễ của bot"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const startTime = Date.now();
      await interaction.editReply("🏓 Pong!");
      const endTime = Date.now();

      const botLatency = endTime - startTime;
      const apiLatency = Math.round(client.ws.ping);

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle("🏓 Pong!")
        .addFields(
          { name: "⏱️ Bot Latency", value: `\`${botLatency}ms\``, inline: true },
          { name: "📡 API Latency", value: `\`${apiLatency}ms\``, inline: true },
        )
        .setFooter({ text: `Shard: ${client.ws.shards.size || 1}` })
        .setTimestamp();

      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh ping:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi kiểm tra ping!")] });
    }
  },
};

export default cmd;
