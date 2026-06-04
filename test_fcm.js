const admin = require('./backend/config/firebase-admin');

async function testPush() {
  try {
    const token = 'YOUR_DEVICE_TOKEN'; // I need a token to test, or I can just test if the payload structure throws an error.
    
    // We can't really test delivery without a device token.
    // But we can check the MongoDB to get the latest FCM token!
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/attendance', { useNewUrlParser: true });
    console.log('Connected to DB');
    
    const col = mongoose.connection.collection('students');
    // Find any student with an fcmToken
    const student = await col.findOne({ fcmTokens: { $exists: true, $not: { $size: 0 } } });
    
    if (!student) {
      console.log('No student found with an FCM token. Registration failed from Android device!');
      process.exit(1);
    }
    
    const fcmToken = student.fcmTokens[0];
    console.log('Found FCM Token:', fcmToken);
    
    const message = {
      notification: {
        title: 'Test Instant Alert',
        body: 'This is a test to verify instant delivery'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'attendance_alerts',
          priority: 'max',
          defaultVibrateTimings: true,
          visibility: 'public'
        }
      },
      token: fcmToken
    };
    
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.error('Error sending push:', error);
  } finally {
    process.exit(0);
  }
}

testPush();
