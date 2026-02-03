const Groq = require('groq-sdk');
require('dotenv').config();

class AIService {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    
    // Using llama-3.3-70b-versatile - current working model
    this.model = "llama-3.3-70b-versatile";
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async generateResponse(prompt) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 Calling Groq Llama API (attempt ${attempt})...`);
        
        const completion = await this.groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a helpful college AI assistant that helps with student information, attendance, and academic queries. Be concise and helpful."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: this.model,
          temperature: 0.2,
          max_tokens: 2048,
        });
        
        console.log('✅ Groq API response received');
        return completion.choices[0]?.message?.content || "No response generated";
      } catch (error) {
        lastError = error;
        console.error(`❌ Groq API Error (attempt ${attempt}):`, error.message);
        
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

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new AIService();
