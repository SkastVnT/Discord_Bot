import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import type { SlashCommand } from "../types/command.js";

// Bug fix #10: stale closure — getPlayer(guildId) called inside setTimeout callback
// instead of capturing the player reference from outer scope

const sleepTimers = new Map<string, ReturnType<typeof setTimeout>>();

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("⏰ Đặt hẹn giờ tắt nhạc")
    .addNumberOption((option) =>
      option
        .setName("minutes")
        .setDescription("Số phút (0 để hủy)")
        .setMinValue(0)
        .setMaxValue(1440)
        .setRequired(true),
    ),

  async run({ client: _client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player) {
        return interaction.editReply("❌ Không có player nào đang hoạt động!");
      }

      const minutes = interaction.options.getNumber("minutes", true);
      const guildId = interaction.guildId!;

      if (sleepTimers.has(guildId)) {
        clearTimeout(sleepTimers.get(guildId)!);
        sleepTimers.delete(guildId);
      }

      if (minutes === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x808080)
          .setDescription("⏰ Đã hủy hẹn giờ tắt nhạc");
        return interaction.editReply({ embeds: [embed] });
      }

      // Bug fix #10: capture guildId (not player) so we resolve a fresh player
      // reference inside the callback, avoiding stale closures
      const timer = setTimeout(() => {
        const currentPlayer = getPlayer(guildId);
        if (currentPlayer?.connection) {
          currentPlayer.destroy();
            (interaction.channel as import("discord.js").GuildTextBasedChannel)
            ?.send("⏰ Đã đến giờ ngủ! Tắt nhạc và rời voice channel.")
            .catch(() => {});
        }
        sleepTimers.delete(guildId);
      }, minutes * 60 * 1000);

      sleepTimers.set(guildId, timer);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setDescription(
          `⏰ Đã đặt hẹn giờ: Bot sẽ tắt sau **${minutes} phút**\n\n💡 *Dùng /sleep 0 để hủy*`,
        )
        .setFooter({
          text: `Sẽ tắt lúc: ${new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString("vi-VN")}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh sleep:", error);
      await interaction.editReply("❌ Đã xảy ra lỗi khi đặt hẹn giờ!");
    }
  },
};

export default cmd;
