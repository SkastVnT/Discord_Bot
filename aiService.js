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
 * Call OpenAI API
 */
async function callOpenAI(prompt, systemPrompt = "") {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
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
    { name: "Gemini", fn: () => callGemini(prompt, systemPrompt) },
    { name: "Grok", fn: () => callGrok(prompt, systemPrompt) },
    { name: "DeepSeek", fn: () => callDeepSeek(prompt, systemPrompt) },
    { name: "OpenAI", fn: () => callOpenAI(prompt, systemPrompt) },
  ];

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
 * Search Google for lyrics
 */
export async function searchGoogleLyrics(songName, artist) {
  const query = `${songName} ${artist} lyrics`;
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY_3 || process.env.GOOGLE_SEARCH_API_KEY_4;
  const cseId = process.env.GOOGLE_CSE_ID || "017576662512468239146:omuauf_lfve"; // Default CSE ID
  
  try {
    const response = await axios.get(
      `https://www.googleapis.com/customsearch/v1`,
      {
        params: {
          key: apiKey,
          cx: cseId,
          q: query,
          num: 5,
        },
      }
    );

    const items = response.data.items || [];
    return items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));
  } catch (error) {
    console.log("❌ Google Search failed:", error.message);
    return [];
  }
}

/**
 * AI-powered lyrics finder with context understanding
 */
export async function findLyricsWithAI(songName, artist) {
  try {
    // Search Google for lyrics sources
    const searchResults = await searchGoogleLyrics(songName, artist);
    
    const systemPrompt = `You are a lyrics expert. Your task is to find and return the COMPLETE lyrics for the EXACT song requested.
CRITICAL RULES:
1. Song name MUST match: "${songName}"
2. Artist MUST match: "${artist}"
3. Do NOT return lyrics from different songs, covers, or remixes
4. If you cannot find the EXACT match, return "NOT_FOUND"
5. Return ONLY the lyrics text, no other commentary
6. Include the full lyrics from start to end`;

    const userPrompt = `Find the complete lyrics for this song:
Song: "${songName}"
Artist: "${artist}"

Google search results for context:
${searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Link: ${r.link}`).join('\n\n')}

Based on these search results, please provide the COMPLETE lyrics for "${songName}" by "${artist}".
If this is NOT the correct song/artist combination, respond with only: NOT_FOUND`;

    const lyrics = await callAI(userPrompt, systemPrompt);
    
    if (lyrics.includes("NOT_FOUND") || lyrics.length < 50) {
      return null;
    }
    
    return lyrics;
  } catch (error) {
    console.error("❌ AI Lyrics search failed:", error.message);
    return null;
  }
}
