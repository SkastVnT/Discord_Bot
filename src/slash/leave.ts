import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "ziplayer";
import { successEmbed, errorEmbed } from "../utils/embeds.js";
import type { SlashCommand } from "../types/command.js";

const cmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("🚪 Cho bot rời khỏi voice channel"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const player = getPlayer(interaction.guildId!);

      if (!player?.connection) {
        return interaction.editReply({ embeds: [errorEmbed("Bot không ở trong voice channel nào!")] });
      }

      const voiceChannel = interaction.guild!.members.cache.get(client.user!.id)
        ?.voice.channel;
      const channelName = voiceChannel?.name ?? "voice channel";

      await player.disconnect();

      await interaction.editReply({
        embeds: [successEmbed(`🚪 Đã rời khỏi **${channelName}**!`)],
      });
    } catch (error) {
      console.error("Lỗi trong lệnh leave:", error);
      await interaction.editReply({ embeds: [errorEmbed("Đã xảy ra lỗi khi rời voice channel!")] });
    }
  },
};

export default cmd;
