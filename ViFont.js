import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

/** Xóa dấu tiếng Việt */
export function removeVietnameseTones(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Giới hạn ký tự */
export function ViFonttrim(str, max = 2000) {
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

/** Gửi phản hồi tạm thời */
export async function ViFontfetchInteraction(interaction) {
  try {
    const msg = await interaction.reply({
      content: "🎶 Đang tìm lyrics...",
      fetchReply: true,
    });
    return msg;
  } catch {
    return await interaction.channel.send("🎶 Đang tìm lyrics...");
  }
}

/** Chuyển thời gian sang timestamp Discord */
export function msToTime(ms) {
  const time = Math.floor((Date.now() + ms) / 1000);
  return `<t:${time}:R>`;
}

/** Kiểm tra URL hợp lệ */
export function validURL(str) {
  const regex = /^(https?:\/\/[^\s]+)$/i;
  return regex.test(str);
}

/** Trộn ngẫu nhiên mảng */
export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Cắt query link */
export function ViFontcrop(query) {
  if (query.includes("Zi=")) {
    const parts = query.split("Zi=");
    parts.shift();
    return parts.join("");
  }
  return query;
}

/** Trích xuất tiêu đề bài hát (cho backup) */
export function extractSongTitle(title, artist = "") {
  const normalizedArtist = artist.toLowerCase().trim() || "a";
  const segments = title.split(/-|\||\[|\]|\(|\)| ft/i);

  for (const segment of segments) {
    const trimmed = segment.trim().toLowerCase();
    if (
      trimmed &&
      !trimmed.includes("music") &&
      !trimmed.includes("lyrics") &&
      !trimmed.includes(normalizedArtist)
    ) {
      return segment.trim();
    }
  }
  return title;
}
