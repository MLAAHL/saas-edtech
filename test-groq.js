require('dotenv').config({ path: './backend/.env' });
const Groq = require('groq-sdk');

async function testGroq() {
    console.log('Testing Groq API...');
    console.log('API Key:', process.env.GROQ_API_KEY ? 'Found (' + process.env.GROQ_API_KEY.substring(0, 10) + '...)' : 'NOT FOUND');
    
    try {
        const groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
        
        console.log('\nCalling Groq API...');
        
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: "Say hello in one word"
                }
            ],
            model: "llama3-70b-8192",
            temperature: 0.2,
            max_tokens: 100,
        });
        
        console.log('✅ SUCCESS!');
        console.log('Response:', completion.choices[0]?.message?.content);
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('Full error:', error);
    }
}

testGroq();
