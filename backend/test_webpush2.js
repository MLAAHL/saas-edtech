require('dotenv').config();
const webpush = require('web-push');
const mongoose = require('mongoose');

webpush.setVapidDetails(
    'mailto:office@mlaacademy.edu',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(async () => {
    const db = mongoose.connection.db;
    const col = db.collection('students');
    const student = await col.findOne({ studentID: 'U18ER25C0063' });
    if (!student || !student.webPushSubscriptions) {
        console.log("Student or subscriptions not found");
        process.exit(1);
    }
    
    console.log(`Found ${student.webPushSubscriptions.length} subscriptions`);
    for (const sub of student.webPushSubscriptions) {
        try {
            console.log("Testing sub:", sub.endpoint);
            await webpush.sendNotification(sub, JSON.stringify({ title: 'Test', body: 'Test' }));
            console.log("Success!");
        } catch (e) {
            console.log("Error status:", e.statusCode);
            console.log("Error body:", e.body);
            console.log("Error message:", e.message);
        }
    }
    process.exit(0);
});
