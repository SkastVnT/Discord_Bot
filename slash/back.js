import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("back")
    .setDescription("⏮️ Quay lại bài hát trước đó"),

  async run({ client, interaction }) {
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

    await interaction.editReply("⏮️ Đang phát lại bài hát trước đó!");
  },
};
