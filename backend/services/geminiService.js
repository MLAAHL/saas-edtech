const Groq = require('groq-sdk');
require('dotenv').config();

class AIService {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });

    // Primary model - best instruction following & accuracy
    this.model = "llama-3.3-70b-versatile";
    // Fast fallback for rate limits
    this.fallbackModel = "llama-3.1-8b-instant";
    this.maxRetries = 3;
    this.retryDelay = 2000;

    // Simple response cache to avoid duplicate API calls (TTL: 60s)
    this._cache = new Map();
    this._cacheTTL = 60000;
  }

  // ================================================================
  // QUERY GENERATION - Temperature 0 for deterministic JSON output
  // ================================================================
  async generateQuery(prompt) {
    let lastError;
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 [QueryGen] Calling Groq [${currentModel}] (attempt ${attempt})...`);

        const completion = await this.groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `You are a MongoDB query generator. Output ONLY valid JSON.

RULES:
- Output MUST start with { and end with }
- NO markdown code blocks, NO explanatory text
- Use exact field names from the schema
- Always include "isActive": true for students/subjects
- Use "$regex" with "$options": "i" for text searches
- Use "$regex": "^YYYY-MM-DD" for date queries (NOT $date)
- Keep queries as SIMPLE as possible
- Required output format: {"collection":"","operation":"","query":{},"explanation":""}`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: currentModel,
          temperature: 0.0,     // Zero creativity - we want deterministic JSON
          top_p: 0.1,           // Very tight token selection
          max_tokens: 1536,
          response_format: { type: "json_object" }  // Force JSON mode
        });

        console.log('✅ [QueryGen] Response received');
        return completion.choices[0]?.message?.content || '{"collection":null,"operation":null,"query":null,"explanation":"Failed to generate query"}';
      } catch (error) {
        lastError = error;
        console.error(`❌ [QueryGen] Error (attempt ${attempt}):`, error.message);

        // If JSON mode not supported, fall back to regular generation
        if (error.message?.includes('response_format') || error.message?.includes('json_object')) {
          console.log('⚠️ JSON mode not supported, falling back to regular generation...');
          return await this.generateResponse(prompt);
        }

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited, switching to ${this.fallbackModel}...`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429 || error.message?.includes('rate')) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }
        throw new Error('AI Error: ' + error.message);
      }
    }
    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // GENERAL RESPONSE - For formatting data & conversational replies
  // ================================================================
  async generateResponse(prompt) {
    // Check cache first
    const cacheKey = prompt.substring(0, 200);
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this._cacheTTL) {
      console.log('📦 Cache hit for response');
      return cached.value;
    }

    let lastError;
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 Calling Groq API [${currentModel}] (attempt ${attempt})...`);

        const completion = await this.groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `You are a precise database query assistant for MLA Academy of Higher Learning.

ABSOLUTE RULES:
- NEVER invent, fabricate, or guess any data — zero tolerance
- ONLY use information explicitly provided to you
- If data is missing, say "not found" — NEVER make up values
- When formatting data, use EXACT values — never round or estimate
- Be concise, professional, and accurate
- Use Markdown formatting (tables, bold, headers) for readability
- DO NOT use emojis in formal responses`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: currentModel,
          temperature: 0.1,
          top_p: 0.4,           // Tighter selection for accuracy
          max_tokens: 2048,
        });

        console.log('✅ Groq API response received');
        const result = completion.choices[0]?.message?.content || "No response generated";

        // Cache the result
        this._cache.set(cacheKey, { value: result, time: Date.now() });
        // Evict old cache entries
        if (this._cache.size > 100) {
          const oldestKey = this._cache.keys().next().value;
          this._cache.delete(oldestKey);
        }

        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ Groq API Error (attempt ${attempt}):`, error.message);

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited on ${currentModel}, switching to fallback ${this.fallbackModel}...`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429 || error.message?.includes('rate')) {
          console.log(`⚠️ Rate limited, retrying...`);
          await this.sleep(this.retryDelay * attempt);
          continue;
        }
        throw new Error('AI Error: ' + error.message);
      }
    }
    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // CONVERSATIONAL RESPONSE - With history (ChatGPT-like)
  // ================================================================
  async generateResponseWithHistory(prompt, conversationHistory = []) {
    let lastError;
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 Calling Groq API [${currentModel}] with ${conversationHistory.length} history (attempt ${attempt})...`);

        const messages = [
          {
            role: "system",
            content: `You are an academic AI assistant for MLA Academy of Higher Learning. You help with student information, attendance, subjects, and academic queries.

CRITICAL ACCURACY RULES (NEVER BREAK):
1. ONLY use data EXPLICITLY provided in the current message. NEVER invent or guess data.
2. If asked about a specific person and their data is NOT in the results, say "I don't have data for [name]" — NEVER substitute another person's data.
3. NEVER fabricate names, IDs, percentages, or any statistics.
4. If the database returned 0 results, say "No records found" — do NOT make up results.
5. When showing data, use EXACT values from the database — never round, change, or estimate.
6. If unsure, say "I'm not sure about that" rather than guessing.

PERSONALITY & FORMATTING:
- Be warm, professional, and concise (2-4 sentences for general chat)
- Use Markdown tables, headers, bold, and lists for data
- DO NOT use emojis
- Maintain context from conversation history for follow-up questions
- For greetings, be brief and mention 2-3 things you can help with
- When answering academic questions, reference specific data when available`
          }
        ];

        // Add conversation history (limit to last 8 exchanges for better context)
        const recentHistory = conversationHistory.slice(-8);
        for (const msg of recentHistory) {
          let safeContent = msg.content;
          if (safeContent && safeContent.length > 2000) {
            safeContent = safeContent.substring(0, 2000) + "\n...[truncated]...";
          }
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: safeContent
          });
        }

        messages.push({
          role: "user",
          content: prompt
        });

        const completion = await this.groq.chat.completions.create({
          messages,
          model: currentModel,
          temperature: 0.15,     // Slightly warmer for natural conversation
          top_p: 0.5,
          max_tokens: 2048,
        });

        console.log('✅ Groq API response received (with history)');
        return completion.choices[0]?.message?.content || "No response generated";
      } catch (error) {
        lastError = error;
        console.error(`❌ Groq API Error (attempt ${attempt}):`, error.message);

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited on ${currentModel}, switching to fallback ${this.fallbackModel}...`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429 || error.message?.includes('rate')) {
          console.log(`⚠️ Rate limited, retrying...`);
          await this.sleep(this.retryDelay * attempt);
          continue;
        }
        throw new Error('AI Error: ' + error.message);
      }
    }
    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // CLEAR CACHE - Call when data changes
  // ================================================================
  clearCache() {
    this._cache.clear();
    console.log('🧹 AI response cache cleared');
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new AIService();
