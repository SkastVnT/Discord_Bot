import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("ℹ️ Thông tin về bot"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("ℹ️ Thông tin Bot Cá Nhân")
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          `**${client.user.username}** - Bot phát nhạc cá nhân với đầy đủ tính năng!`
        )
        .addFields(
          {
            name: "⏰ Uptime",
            value: `${days}d ${hours}h ${minutes}m`,
            inline: true,
          },
          {
            name: "📊 Commands",
            value: `${client.slashcommands.size} lệnh`,
            inline: true,
          },
          {
            name: "💻 Phiên bản",
            value: `Node ${process.version}`,
            inline: true,
          },
          {
            name: "🎵 Tính năng",
            value:
              "🎶 Phát nhạc từ YouTube, Spotify, SoundCloud\n" +
              "🎛️ 40+ slash commands\n" +
              "🎚️ Audio filters & effects\n" +
              "📜 Queue management\n" +
              "📝 Lyrics display\n" +
              "🔥 Hot reload system",
            inline: false,
          }
        )
        .setFooter({
          text: `Personal Music Bot`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh about:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi!");
    }
  },
};
