// Test API-Free Chatbot
const http = require('http');

const tests = [
  { message: 'hi', desc: 'Greeting' },
  { message: 'help', desc: 'Help request' },
  { message: 'list all BCA students', desc: 'Student list' },
  { message: 'who teaches python', desc: 'Teacher search' },
  { message: 'who was absent on 15-01-2025', desc: 'Absent students' },
  { message: 'how many students in BDA', desc: 'Count query' }
];

async function testChat(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message });
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/chatbot/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('TESTING API-FREE CHATBOT');
  console.log('='.repeat(60));

  for (const test of tests) {
    console.log(`\n>>> Test: ${test.desc}`);
    console.log(`    Query: "${test.message}"`);
    
    try {
      const start = Date.now();
      const result = await testChat(test.message);
      const duration = Date.now() - start;
      
      console.log(`    Status: ${result.success ? '✓ SUCCESS' : '✗ FAILED'}`);
      console.log(`    Time: ${duration}ms`);
      console.log(`    Response preview: ${(result.answer || result.response || '').substring(0, 100)}...`);
    } catch (error) {
      console.log(`    Status: ✗ ERROR - ${error.message}`);
    }
  }
}

runTests();
