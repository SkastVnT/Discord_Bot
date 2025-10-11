import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("▶️ Tiếp tục phát nhạc"),

  async run({ client, interaction }) {
    const player = getPlayer(interaction.guildId);

    if (!player || !player.isPaused)
      return interaction.editReply("❌ Không có bài hát nào đang bị tạm dừng!");

    player.resume();
    await interaction.editReply("▶️ Tiếp tục phát nhạc!");
  },
};
