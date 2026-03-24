import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean);

const GROK_API_KEY = process.env.GROK_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let currentGeminiIndex = 0;

/**
 * Call Gemini API with fallback to next key if failed
 */
async function callGemini(prompt, systemPrompt = "") {
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const keyIndex = (currentGeminiIndex + i) % GEMINI_KEYS.length;
    const apiKey = GEMINI_KEYS[keyIndex];
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });
      
      currentGeminiIndex = (keyIndex + 1) % GEMINI_KEYS.length;
      return response.text;
    } catch (error) {
      console.log(`❌ Gemini key ${keyIndex + 1} failed:`, error.message);
      if (i === GEMINI_KEYS.length - 1) throw error;
    }
  }
  throw new Error("All Gemini keys failed");
}

/**
 * Call Grok API
 */
async function callGrok(prompt, systemPrompt = "") {
  try {
    const response = await axios.post(
      "https://api.x.ai/v1/chat/completions",
      {
        model: "grok-beta",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROK_API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.log("❌ Grok failed:", error.message);
    throw error;
  }
}

/**
 * Call DeepSeek API
 */
async function callDeepSeek(prompt, systemPrompt = "") {
  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.log("❌ DeepSeek failed:", error.message);
    throw error;
  }
}

/**
 * Call OpenAI API (o4-mini)
 */
async function callOpenAI(prompt, systemPrompt = "") {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "o4-mini",
        messages: [
          { role: "developer", content: systemPrompt },
          { role: "user", content: prompt }
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.log("❌ OpenAI failed:", error.message);
    throw error;
  }
}

/**
 * Main AI call with fallback chain: Gemini -> Grok -> DeepSeek -> OpenAI
 */
export async function callAI(prompt, systemPrompt = "") {
  const providers = [
    { name: "Gemini", fn: () => callGemini(prompt, systemPrompt), enabled: GEMINI_KEYS.length > 0 },
    { name: "Grok", fn: () => callGrok(prompt, systemPrompt), enabled: !!GROK_API_KEY },
    { name: "DeepSeek", fn: () => callDeepSeek(prompt, systemPrompt), enabled: !!DEEPSEEK_API_KEY },
    { name: "OpenAI", fn: () => callOpenAI(prompt, systemPrompt), enabled: !!OPENAI_API_KEY },
  ].filter(p => p.enabled);

  if (providers.length === 0) {
    throw new Error("No AI providers configured. Please add API keys to .env file.");
  }

  for (const provider of providers) {
    try {
      console.log(`🤖 Trying ${provider.name}...`);
      const result = await provider.fn();
      console.log(`✅ ${provider.name} success!`);
      return result;
    } catch (error) {
      console.log(`❌ ${provider.name} failed, trying next...`);
    }
  }

  throw new Error("All AI providers failed");
}

/**
 * Find lyrics using OpenAI o4-mini directly
 */
export async function findLyricsWithAI(songName, artist) {
  if (!OPENAI_API_KEY) {
    console.log("❌ OpenAI API key not configured");
    return null;
  }

  try {
    console.log(`🔍 Tìm lyrics: "${songName}" - ${artist}`);

    const systemPrompt = `You are a lyrics database. Return ONLY the complete song lyrics, nothing else.
Rules:
- Return the full original lyrics (in the original language of the song)
- Keep line breaks between lines
- Separate sections (verse, chorus, bridge) with a blank line
- Do NOT include section labels like [Verse], [Chorus] etc.
- Do NOT add commentary, translation, or explanation
- If you cannot find the lyrics, return exactly: NOT_FOUND`;

    const userPrompt = `Lyrics for "${songName}" by "${artist}"`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "o4-mini",
        messages: [
          { role: "developer", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const lyrics = response.data.choices[0].message.content.trim();

    if (!lyrics || lyrics === "NOT_FOUND" || lyrics.length < 30) {
      console.log("❌ Không tìm thấy lyrics");
      return null;
    }

    console.log(`✅ Đã tìm thấy lyrics (${lyrics.length} ký tự)`);
    return lyrics;
  } catch (error) {
    console.error("❌ OpenAI lyrics search failed:", error.message);
    return null;
  }
}
