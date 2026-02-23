
require('dotenv').config();
const axios = require('axios');

// USE PRODUCTION NUMBER (your verified MLA Academy number)
const PROD_PHONE_ID = '957338630788941';
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

console.log('🚀 Testing with PRODUCTION number...\n');
console.log('Phone ID: 957338630788941 (MLA Academy)');
console.log('Token: ' + TOKEN.substring(0, 15) + '...');
console.log('To: +91 99648 36413\n');

axios.post(
  `https://graph.facebook.com/v22.0/${PROD_PHONE_ID}/messages`,
  {
    messaging_product: 'whatsapp',
    to: '919964836413',
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' }
    }
  },
  {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  }
).then(res => {
  console.log('✅✅✅ SUCCESS! ✅✅✅\n');
  console.log('Message ID:', res.data.messages[0].id);
  console.log('\n📱 CHECK YOUR WHATSAPP RIGHT NOW!');
  console.log('Number: +91 99648 36413\n');
  console.log('🎉 YOUR WHATSAPP INTEGRATION WORKS!\n');
  console.log('Message from: MLA Academy (+91 91489 15339)\n');
}).catch(err => {
  console.error('❌ Error:', err.response?.data?.error?.message);
  console.error('Code:', err.response?.data?.error?.code);
  
  if (err.response?.data?.error?.code === 133010) {
    console.log('\n💡 Still error 133010?');
    console.log('Your business verification needs to complete first.');
    console.log('Click "Learn more" on the business verification page.');
  } else if (err.response?.data?.error?.code === 131047) {
    console.log('\n💡 Error 131047: Message could not be sent');
    console.log('This usually means:');
    console.log('1. Business not fully verified yet');
    console.log('2. Template not approved');
    console.log('3. Messaging window expired');
  }
});

