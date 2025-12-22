import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("equalizer")
    .setDescription("🎚️ Điều chỉnh equalizer")
    .addStringOption((option) =>
      option
        .setName("preset")
        .setDescription("Chọn preset equalizer")
        .setRequired(true)
        .addChoices(
          { name: "🎵 Flat (Mặc định)", value: "flat" },
          { name: "🎸 Rock", value: "rock" },
          { name: "🎹 Classical", value: "classical" },
          { name: "🎤 Pop", value: "pop" },
          { name: "🎧 Electronic", value: "electronic" },
          { name: "🎺 Jazz", value: "jazz" },
          { name: "🎬 Cinema", value: "cinema" },
          { name: "🎮 Gaming", value: "gaming" }
        )
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const preset = interaction.options.getString("preset");
      
      const presetEmoji = {
        flat: "🎵",
        rock: "🎸",
        classical: "🎹",
        pop: "🎤",
        electronic: "🎧",
        jazz: "🎺",
        cinema: "🎬",
        gaming: "🎮",
      };

      const presetNames = {
        flat: "Flat",
        rock: "Rock",
        classical: "Classical",
        pop: "Pop",
        electronic: "Electronic",
        jazz: "Jazz",
        cinema: "Cinema",
        gaming: "Gaming",
      };

      // Áp dụng equalizer preset
      try {
        if (preset === "flat") {
          player.filters.clear();
        } else {
          await player.filters.set("Equalizer", { preset });
        }
      } catch (err) {
        console.log("Equalizer không hỗ trợ:", err);
      }

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setDescription(
          `${presetEmoji[preset]} Đã áp dụng equalizer: **${presetNames[preset]}**\n\n⚠️ *Có thể mất vài giây để áp dụng*`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh equalizer:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi áp dụng equalizer!");
    }
  },
};
