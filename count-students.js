// Script to list BCOM Sem 2 students with their IDs
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function listStudents() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ MONGODB_URI not found in environment variables');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();

        // Get BCOM semester 2 students
        const students = await db.collection('students')
            .find({
                stream: 'BCOM',
                semester: 2,
                isActive: true
            })
            .project({ studentID: 1, name: 1, _id: 0 })
            .sort({ studentID: 1 })
            .toArray();

        console.log(`📚 BCOM - Semester 2 (${students.length} students):`);
        console.log('─'.repeat(60));
        students.forEach((s, i) => {
            console.log(`${String(i + 1).padStart(3)}. ${(s.studentID || 'N/A').padEnd(20)} | ${s.name}`);
        });

        console.log('\n📌 Total: ' + students.length + ' students');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

listStudents();
