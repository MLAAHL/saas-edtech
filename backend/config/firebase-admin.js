// config/firebase-admin.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
  try {
    let serviceAccount;

    // Check if we have credentials in environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('📡 Initializing Firebase Admin via Environment Variables');
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else {
      // Fallback to local JSON file
      try {
        console.log('📁 Initializing Firebase Admin via serviceAccountKey.json');
        serviceAccount = require('./serviceAccountKey.json');
      } catch (fileError) {
        throw new Error('No Firebase credentials found (missing ENV vars or serviceAccountKey.json)');
      }
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.projectId
    });

    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
  }
}

module.exports = admin;
