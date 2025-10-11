// MAKE BY SKAST
// ===========================================
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ===========================================
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { Player } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import { generateDependencyReport } from "@discordjs/voice";
import ffmpeg from "ffmpeg-static";
import playdl from "play-dl"; // ✅ fallback audio stream
import { StreamType } from "@discordjs/voice";

// ===========================================
// 🧩 Dependency Check
function check(pkg) {
  try {
    require(pkg);
    return "✅ loaded";
  } catch {
    return "❌ not found";
  }
}

console.log("--------------------------------------------------");
console.log("Core Dependencies");
console.log("- @discordjs/voice:", check("@discordjs/voice"));
console.log("- prism-media:", check("prism-media"));
console.log("\nOpus Libraries");
console.log("- @discordjs/opus:", check("@discordjs/opus"));
console.log("- opusscript:", check("opusscript"));
console.log("\nEncryption Libraries");
console.log("- sodium-native:", check("sodium-native"));
console.log("- sodium:", check("sodium"));
console.log("- libsodium-wrappers:", check("libsodium-wrappers"));
console.log("- tweetnacl:", check("tweetnacl"));
console.log("\nFFmpeg");
console.log(generateDependencyReport());
console.log("--------------------------------------------------");
console.log("✅ Audio dependencies loaded successfully!");
console.log("--------------------------------------------------");

if (ffmpeg) process.env.FFMPEG_PATH = ffmpeg;

// ===========================================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1046784301615812649";
const GUILD_ID = "815576037236277268";
const LOAD_SLASH = process.argv[2] === "load";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.slashcommands = new Collection();

// ===========================================
// 🎧 PLAYER CONFIG
const player = new Player(client, {
  skipFFmpeg: false,
  ytdlOptions: {
    quality: "highestaudio",
    filter: "audioonly",
    highWaterMark: 1 << 25,
    requestOptions: { timeout: 20000 },
  },
  bufferingTimeout: 5000,
  connectionTimeout: 20000,
  leaveOnEmpty: false,
  leaveOnEnd: false,
});
client.player = player;

// ===========================================
// 🎵 LOAD EXTRACTORS
(async () => {
  try {
    await player.extractors.register(YoutubeiExtractor, {});
    console.log("✅ YouTubei extractor registered!");
  } catch (err) {
    console.warn("⚠️ YouTubei extractor failed:", err.message);
  }
  console.log("🎵 Music extractors loaded successfully!");
})();

// ===========================================
// ✅ Fallback fix for no audio (play-dl)


player.events.on("onBeforeCreateStream", async (track, source, _queue) => {
  if (source === "youtube" || track.url.includes("youtube.com")) {
    const playStream = await playdl.stream(track.url, {
      quality: 2,
      discordPlayerCompatibility: true,
    });
    return { stream: playStream.stream, type: playStream.type };
  }
});



// ===========================================
// 🔄 Load Slash Commands
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commands = [];
const slashFolder = path.join(__dirname, "slash");
const slashFiles = fs.readdirSync(slashFolder).filter(f => f.endsWith(".js"));

for (const file of slashFiles) {
  const filePath = path.join(slashFolder, file);
  const { default: slashcmd } = await import(`file://${filePath}`);
  client.slashcommands.set(slashcmd.data.name, slashcmd);
  if (LOAD_SLASH) commands.push(slashcmd.data.toJSON());
}

// ===========================================
// 🧩 Register Commands
if (LOAD_SLASH) {
  const rest = new REST({ version: "9" }).setToken(TOKEN);
  try {
    console.log(`🔄 Reloading ${commands.length} slash command(s)...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Reload slash commands thành công!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi load slash commands:", error);
    process.exit(1);
  }
} else {
  // ===========================================
  client.once(Events.ClientReady, () => {
    console.log(`✅ Đăng nhập thành công: ${client.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const slashcmd = client.slashcommands.get(interaction.commandName);
    if (!slashcmd) return interaction.reply({ content: "Không tìm thấy lệnh này!", ephemeral: true });
    try {
      await slashcmd.run({ client, interaction });
    } catch (err) {
      console.error("❌ Lỗi khi chạy lệnh:", err);
      await interaction.reply({ content: "Đã xảy ra lỗi khi chạy lệnh!", ephemeral: true });
    }
  });

  // ===========================================
  // 🎶 Player Events
  player.events.on("audioTrackAdd", (queue, track) => {
    console.log(`🎵 Đã thêm: ${track.title} vào queue`);
  });
  player.events.on("playerStart", (queue, track) => {
    console.log(`▶️ Bắt đầu phát: ${track.title}`);
    queue.metadata.channel?.send(`🎶 Đang phát: **${track.title}**`);
  });
  player.events.on("emptyQueue", (queue) => {
    // console.log("📝 Queue trống, rời sau 30s");
    queue.metadata.channel?.send("✅ Đã phát hết nhạc trong queue!");
  });
  player.events.on("disconnect", (queue) => {
    console.log("🚪 Bot đã rời voice channel");
    queue.metadata.channel?.send("👋 Đã rời voice channel!");
  });
  player.events.on("playerFinish", (queue, track) => {
    console.log(`🏁 Kết thúc: ${track.title}`);
  });

  // ===========================================
  client.login(TOKEN);
}
