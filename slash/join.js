import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getManager, getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("🎤 Cho bot vào voice channel của bạn"),

  async run({ client, interaction }) {
    try {
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        return interaction.editReply(
          "❌ Bạn cần vào một voice channel trước!"
        );
      }

      let player = getPlayer(interaction.guildId);
      
      if (!player) {
        player = await getManager().create(interaction.guildId, {
          userdata: { channel: interaction.channel },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
        });
      }

      if (player.connection) {
        return interaction.editReply("⚠️ Bot đã ở trong voice channel rồi!");
      }

      await player.connect(voiceChannel);

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(`🎤 Đã vào **${voiceChannel.name}**!`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh join:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi vào voice channel!");
    }
  },
};
