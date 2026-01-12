const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // TRY 1: Use specific version "gemini-1.0-pro"
    // If this fails, the only remaining option is your API Key permissions.
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    });
    
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async generateResponse(prompt) {
    // ... (rest of your code stays the same)
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error;
        if (error.status === 503 || error.message.includes('429')) {
           // ... retry logic
           await this.sleep(this.retryDelay * attempt);
           continue;
        }
        console.error('Gemini API Error:', error.message);
        throw new Error('Gemini Error: ' + error.message);
      }
    }
    throw new Error('Gemini API unavailable');
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new GeminiService();
