declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TOKEN?: string;
      CLIENT_ID?: string;
      /** Comma-separated list of guild IDs */
      GUILD_IDS?: string;
      GEMINI_API_KEY_1?: string;
      GEMINI_API_KEY_2?: string;
      GEMINI_API_KEY_3?: string;
      GEMINI_API_KEY_4?: string;
      GROK_API_KEY?: string;
      DEEPSEEK_API_KEY?: string;
      OPENAI_API_KEY?: string;
      FFMPEG_PATH?: string;
      MUSIC_FOLDER?: string;
      /** MongoDB cho tính năng playlist */
      MONGODB_URI?: string;
      MONGODB_DB_NAME?: string;
      MONGODB_X509_ENABLED?: string;
      MONGODB_X509_URI?: string;
      MONGODB_X509_CERT_PATH?: string;
      MONGODB_TLS_ALLOW_INVALID_CERTIFICATES?: string;
      PLAYLIST_IMPORT_TTL_MINUTES?: string;
      PLAYLIST_IMPORT_MAX_TRACKS?: string;
      PLAYLIST_MAX_TRACKS?: string;
      /** Đường dẫn yt-dlp; bỏ trống thì dùng binary kèm theo youtube-dl-exec */
      YTDLP_PATH?: string;
      /** Cloudflare R2 cho file người dùng upload */
      R2_ACCESS_KEY_ID?: string;
      R2_SECRET_ACCESS_KEY?: string;
      R2_BUCKET_NAME?: string;
      S3_API_ENDPOINT?: string;
      R2_PUBLIC_BASE_URL?: string;
      R2_MAX_UPLOAD_MB?: string;
      /** Danh sách Discord user ID của chủ bot, ngăn cách bằng dấu phẩy */
      BOT_OWNER_IDS?: string;
      /** Spotify Web API (Client Credentials) */
      SPOTIFY_CLIENT_ID?: string;
      SPOTIFY_CLIENT_SECRET?: string;
      SPOTIFY_MARKET?: string;
    }
  }
}

export {};
