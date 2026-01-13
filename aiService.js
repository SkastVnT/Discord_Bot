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
 * Crawl lyrics from a URL
 */
async function crawlLyricsFromUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    
    // Extract text content from common lyrics sites
    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit to reasonable length
    return text.substring(0, 10000);
  } catch (error) {
    console.log(`❌ Failed to crawl ${url}:`, error.message);
    return '';
  }
}

/**
 * AI-powered lyrics finder with context understanding
 */
export async function findLyricsWithAI(songName, artist) {
  try {
    // Search Google for lyrics sources
    const searchResults = await searchGoogleLyrics(songName, artist);
    
    if (searchResults.length === 0) {
      console.log("❌ No Google search results found");
      return null;
    }
    
    // Crawl top 3 results for actual content
    console.log(`📥 Crawling top ${Math.min(3, searchResults.length)} results...`);
    const crawledContent = [];
    for (let i = 0; i < Math.min(3, searchResults.length); i++) {
      const content = await crawlLyricsFromUrl(searchResults[i].link);
      if (content) {
        crawledContent.push({
          url: searchResults[i].link,
          title: searchResults[i].title,
          content: content.substring(0, 3000) // Limit per page
        });
      }
    }
    
    if (crawledContent.length === 0) {
      console.log("❌ Could not crawl any content");
      return null;
    }
    
    const systemPrompt = `You are a lyrics extraction expert. Extract ONLY the complete song lyrics from the provided web content.

CRITICAL RULES:
1. Extract lyrics for: "${songName}" by "${artist}"
2. Remove ALL navigation, ads, comments, and website content
3. Return ONLY the pure lyrics text (verse, chorus, bridge, etc.)
4. Keep original formatting with line breaks
5. If lyrics not found or wrong song, return "NOT_FOUND"
6. Do NOT add any commentary or explanations`;

    const userPrompt = `Extract the complete lyrics for "${songName}" by "${artist}" from these web pages:

${crawledContent.map((c, i) => `=== Page ${i + 1}: ${c.title} ===\n${c.content}\n`).join('\n\n')}

Return ONLY the lyrics text.`;

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
