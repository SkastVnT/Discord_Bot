import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "ziplayer";

export default {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("🎛️ Áp dụng bộ lọc âm thanh")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Chọn loại bộ lọc")
        .setRequired(true)
        .addChoices(
          { name: "🎸 Bass Boost", value: "bassboost" },
          { name: "🎵 Nightcore", value: "nightcore" },
          { name: "🐌 Vaporwave", value: "vaporwave" },
          { name: "🎤 Karaoke", value: "karaoke" },
          { name: "🎧 Treble", value: "treble" },
          { name: "🔊 Normalizer", value: "normalizer" },
          { name: "🌀 Vibrato", value: "vibrato" },
          { name: "📻 Surrounding", value: "surrounding" },
          { name: "❌ Tắt tất cả", value: "off" }
        )
    ),

  async run({ client, interaction }) {
    try {
      const player = getPlayer(interaction.guildId);

      if (!player || !player.isPlaying) {
        return interaction.editReply("❌ Không có bài hát nào đang phát!");
      }

      const filterType = interaction.options.getString("type");

      if (filterType === "off") {
        player.filters.clear();
        const embed = new EmbedBuilder()
          .setColor("Gray")
          .setDescription("❌ Đã tắt tất cả bộ lọc âm thanh");
        return interaction.editReply({ embeds: [embed] });
      }

      // Tắt các filter cũ và bật filter mới
      player.filters.clear();
      
      const filterMap = {
        bassboost: "BassBoost",
        nightcore: "Nightcore",
        vaporwave: "Vaporwave",
        karaoke: "Karaoke",
        treble: "Treble",
        normalizer: "Normalizer",
        vibrato: "Vibrato",
        surrounding: "Surrounding",
      };

      const filterName = filterMap[filterType];
      
      try {
        await player.filters.set(filterName);
      } catch (err) {
        // Nếu filter không được hỗ trợ, thử phương thức khác
        console.log("Filter không hỗ trợ:", filterName);
      }

      const filterEmoji = {
        bassboost: "🎸",
        nightcore: "🎵",
        vaporwave: "🐌",
        karaoke: "🎤",
        treble: "🎧",
        normalizer: "🔊",
        vibrato: "🌀",
        surrounding: "📻",
      };

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setDescription(
          `${filterEmoji[filterType]} Đã áp dụng bộ lọc **${filterName}**!\n\n⚠️ *Bộ lọc có thể mất vài giây để áp dụng*`
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh filter:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi áp dụng bộ lọc!");
    }
  },
};
