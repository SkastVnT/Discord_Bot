import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("❓ Hiển thị danh sách lệnh và hướng dẫn"),

  async run({ client, interaction }) {
    await interaction.deferReply();
    try {
      const commands = client.slashcommands;
      
      const musicCommands = [];
      const controlCommands = [];
      const queueCommands = [];
      const filterCommands = [];
      const utilityCommands = [];

      commands.forEach((cmd) => {
        const name = cmd.data.name;
        const desc = cmd.data.description;
        const line = `\`/${name}\` - ${desc}`;

        // Phân loại commands
        if (["play", "pause", "resume", "skip", "back", "stop", "quit"].includes(name)) {
          musicCommands.push(line);
        } else if (["volume", "seek", "forward", "rewind", "replay", "speed"].includes(name)) {
          controlCommands.push(line);
        } else if (["queue", "nowplaying", "clear", "remove", "move", "shuffle", "skipto"].includes(name)) {
          queueCommands.push(line);
        } else if (["filter", "loop", "autoplay", "8d"].includes(name)) {
          filterCommands.push(line);
        } else {
          utilityCommands.push(line);
        }
      });

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setTitle("🎵 Hướng dẫn sử dụng Bot")
        .setDescription(`Bot có **${commands.size}** lệnh\n\n💡 *Sử dụng các lệnh bằng cách gõ `/` trong chat*`)
        .setThumbnail(client.user.displayAvatarURL());

      if (musicCommands.length > 0) {
        embed.addFields({
          name: "🎶 Phát nhạc cơ bản",
          value: musicCommands.join("\n"),
          inline: false,
        });
      }

      if (controlCommands.length > 0) {
        embed.addFields({
          name: "🎛️ Điều khiển nâng cao",
          value: controlCommands.join("\n"),
          inline: false,
        });
      }

      if (queueCommands.length > 0) {
        embed.addFields({
          name: "📜 Quản lý hàng chờ",
          value: queueCommands.join("\n"),
          inline: false,
        });
      }

      if (filterCommands.length > 0) {
        embed.addFields({
          name: "🎚️ Bộ lọc & Hiệu ứng",
          value: filterCommands.join("\n"),
          inline: false,
        });
      }

      if (utilityCommands.length > 0) {
        embed.addFields({
          name: "🔧 Tiện ích",
          value: utilityCommands.join("\n"),
          inline: false,
        });
      }

      embed.setFooter({
        text: `Yêu cầu bởi ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Lỗi trong lệnh help:", error);
      return interaction.editReply("❌ Đã xảy ra lỗi khi hiển thị help!");
    }
  },
};
