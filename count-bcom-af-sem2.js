// Script to count BCom A&F Semester 2 students
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function countBComAFSem2() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI not found');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();

        const count = await db.collection('students').countDocuments({
            stream: 'BCom A&F',
            semester: 2,
            isActive: true
        });

        console.log(`\n📊 BCom A&F Semester 2 Count: ${count}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

countBComAFSem2();
