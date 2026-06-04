const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/');
  await client.connect();
  const db = client.db('smart_attendance');
  const student = await db.collection('students').findOne({
    $or: [{ lastLogin: { $exists: true } }, { 'parentAuth.lastLogin': { $exists: true } }]
  }, { sort: { _id: -1 } });
  
  if (student) {
    console.log("Student:", student.studentID, student.name);
    console.log("lastLogin (root):", student.lastLogin);
    console.log("parentAuth:", student.parentAuth);
    console.log("fcmTokens:", student.fcmTokens);
    console.log("appStatus:", student.appStatus);
    console.log("notificationStatus:", student.notificationStatus);
  } else {
    console.log("No student found");
  }
  await client.close();
}

run().catch(console.error);
