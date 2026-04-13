require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const s = await db.collection('students').findOne({ studentID: { $regex: new RegExp('^U18ER25C0063$', 'i') } });
  if (s) {
    console.log('Student found:');
    console.log('  Name:', s.name);
    console.log('  ID:', s.studentID);
    console.log('  Active:', s.isActive);
    console.log('  Last Login:', s.lastLogin || 'NEVER');
    console.log('  Notification Status:', s.notificationStatus || 'NOT SET');
    console.log('  FCM Tokens:', s.fcmTokens ? s.fcmTokens.length + ' tokens' : 'NONE');
    if (s.fcmTokens && s.fcmTokens.length > 0) {
      s.fcmTokens.forEach((t, i) => console.log('    Token ' + (i+1) + ':', t.substring(0, 30) + '...'));
    }
  } else {
    console.log('Student NOT FOUND with ID U18ER25C0063');
  }
  mongoose.disconnect();
});
