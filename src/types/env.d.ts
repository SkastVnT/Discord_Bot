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
    }
  }
}

export {};
