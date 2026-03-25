import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

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
 * Find lyrics using OpenAI o4-mini, with fallback to callAI (Gemini/Grok/DeepSeek)
 */
export async function findLyricsWithAI(songName, artist) {
  const systemPrompt = `You are a music lyrics expert. Return ONLY the complete song lyrics.
- Original language, no translation
- Each lyric line on its own line (\\n separated)
- Blank line between sections
- No section labels like [Verse], [Chorus]
- No commentary or explanations
- If not found: NOT_FOUND`;

  const userPrompt = `Full lyrics for "${songName}"${artist ? ` by ${artist}` : ''}`;

  const REFUSAL_KEYWORDS = ['copyright', 'unable to provide', 'cannot provide', "can't provide",
    'i cannot', "i can't", 'not able to', 'sorry', 'restricted', 'protected',
    'do not have access', "don't have access", 'not available'];

  const isRefusal = (text) =>
    REFUSAL_KEYWORDS.some(k => text.toLowerCase().includes(k)) || text.length < 200;

  console.log(`🔍 Tìm lyrics: "${songName}" - ${artist}`);

  // Try o4-mini first
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'o4-mini',
          messages: [
            { role: 'developer', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
        },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        }
      );
      const text = response.data.choices[0].message.content.trim();
      if (text && text !== 'NOT_FOUND' && !isRefusal(text)) {
        console.log(`✅ o4-mini: ${text.length} ký tự`);
        return text;
      }
      console.log(`⚠️ o4-mini refused hoặc quá ngắn (${text.length} chars), thử Gemini...`);
    } catch (e) {
      console.log('⚠️ o4-mini failed:', e.message);
    }
  }

  // Fallback: Gemini / Grok / DeepSeek via callAI
  try {
    const text = await callAI(userPrompt, systemPrompt);
    if (text && text !== 'NOT_FOUND' && !isRefusal(text)) {
      console.log(`✅ Fallback AI: ${text.length} ký tự`);
      return text;
    }
  } catch (e) {
    console.log('❌ Fallback AI failed:', e.message);
  }

  console.log('❌ Không tìm thấy lyrics');
  return null;
}
