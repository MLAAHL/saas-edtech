require('dotenv').config();
const webpush = require('web-push');

// Set your VAPID keys
webpush.setVapidDetails(
    'mailto:office@mlaacademy.edu',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// We need a subscription object from a client to test.
console.log('VAPID Configured:', !!process.env.VAPID_PUBLIC_KEY);
