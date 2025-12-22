import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("🔊 Điều chỉnh âm lượng của bot")
    .addNumberOption((option) =>
      option
        .setName("level")
        .setDescription("Mức âm lượng (0-200)")
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(false)
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const volumeLevel = interaction.options.getNumber("level");

      // Nếu không có giá trị, hiển thị âm lượng hiện tại
      if (volumeLevel === null) {
        const currentVolume = player.volume || 100;
        const volumeBar = createVolumeBar(currentVolume);
        
        const embed = new EmbedBuilder()
          .setColor("Random")
          .setTitle("🔊 Âm lượng hiện tại")
          .setDescription(`${volumeBar}\n\n**${currentVolume}%**`)
          .setFooter({ text: "Sử dụng /volume <0-200> để thay đổi" });

        return interaction.editReply({ embeds: [embed] });
      }

      // Thay đổi âm lượng
      player.setVolume(volumeLevel);

      const volumeEmoji = getVolumeEmoji(volumeLevel);
      const volumeBar = createVolumeBar(volumeLevel);

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setTitle(`${volumeEmoji} Đã thay đổi âm lượng`)
        .setDescription(`${volumeBar}\n\n**${volumeLevel}%**`)
        .setFooter({ text: `Điều chỉnh bởi ${interaction.user.tag}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh volume:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi điều chỉnh âm lượng!");
    }
  },
};

/**
 * Tạo thanh âm lượng trực quan
 */
function createVolumeBar(volume) {
  const barLength = 20;
  const filledLength = Math.round((volume / 200) * barLength);
  const emptyLength = barLength - filledLength;
  
  const filled = "█".repeat(filledLength);
  const empty = "░".repeat(emptyLength);
  
  return `\`${filled}${empty}\``;
}

/**
 * Lấy emoji phù hợp với mức âm lượng
 */
function getVolumeEmoji(volume) {
  if (volume === 0) return "🔇";
  if (volume < 33) return "🔈";
  if (volume < 66) return "🔉";
  return "🔊";
}
