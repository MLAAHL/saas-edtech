// Script to fix BBA Sem 2 student IDs to correct format U18ER25M00XX
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function fixBBAStudentIDs() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();

        // Get current BBA Semester 2 students sorted by name
        const students = await db.collection('students')
            .find({
                stream: 'BBA',
                semester: 2,
                isActive: true
            })
            .sort({ name: 1 })
            .toArray();

        console.log(`📊 Found ${students.length} BBA Semester 2 students\n`);
        console.log('📊 Updating BBA Semester 2 student IDs to U18ER25M00XX format...\n');

        let updated = 0;
        let idNumber = 1; // Start from 01

        for (const student of students) {
            // Generate new ID: U18ER25M00XX (XX from 01 onwards)
            const newID = `U18ER25M00${String(idNumber).padStart(2, '0')}`;

            const result = await db.collection('students').updateOne(
                { _id: student._id },
                {
                    $set: {
                        studentID: newID,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`✅ ${student.name} → ${newID}`);
                updated++;
            } else {
                console.log(`⚠️ ${student.name} - already has ${newID}`);
            }

            idNumber++;
        }

        console.log('\n══════════════════════════════════════════════════');
        console.log(`📊 SUMMARY: Updated ${updated} students`);

        // Final list
        const finalStudents = await db.collection('students')
            .find({ stream: 'BBA', semester: 2, isActive: true })
            .project({ studentID: 1, name: 1, _id: 0 })
            .sort({ studentID: 1 })
            .toArray();

        console.log(`\n📚 Final BBA Sem 2 list (${finalStudents.length} students):`);
        console.log('─'.repeat(60));
        finalStudents.forEach((s, i) => {
            console.log(`${String(i + 1).padStart(3)}. ${(s.studentID || 'N/A').padEnd(18)} | ${s.name}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

fixBBAStudentIDs();
