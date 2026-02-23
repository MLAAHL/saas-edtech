// Script to handle duplicate SHALINI and fix remaining
require('dotenv').config({ path: './backend/.env' });
const { MongoClient, ObjectId } = require('mongodb');

async function fixShaliniAndRemaining() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();

        // Get both SHALINI records
        const shaliniRecords = await db.collection('students').find({
            name: { $regex: /SHALINI/i },
            stream: 'BCOM',
            semester: 2
        }).toArray();

        console.log('📋 Found SHALINI records:');
        shaliniRecords.forEach(s => {
            console.log(`   - ${s.name} | ID: ${s.studentID} | _id: ${s._id}`);
        });

        // Remove "S SHALINI" (it's incorrectly added, should only be SHALINI S)
        const sShalini = shaliniRecords.find(s => s.name === 'S SHALINI');
        if (sShalini) {
            console.log(`\n🗑️ Removing duplicate "S SHALINI" (ID: ${sShalini.studentID})`);
            await db.collection('students').deleteOne({ _id: sShalini._id });
            console.log('✅ Removed S SHALINI');
        }

        // Now update remaining students
        const remaining = [
            { name: 'SHALINI S', newID: 'U18ER25C0071' },
            { name: 'SHWETHA BAI R', newID: 'U18ER25C0072' },
            { name: 'SONU S', newID: 'U18ER25C0073' },
            { name: 'SPANDANA B', newID: 'U18ER25C0074' },
            { name: 'SPANDANA C', newID: 'U18ER25C0075' },
            { name: 'SUHAS K', newID: 'U18ER25C0076' },
            { name: 'TEJASWINI A', newID: 'U18ER25C0077' },
            { name: 'TEJASWINI C', newID: 'U18ER25C0078' },
            { name: 'VISHAL S', newID: 'U18ER25C0079' },
        ];

        console.log('\n📊 Updating remaining students...\n');

        for (const student of remaining) {
            const result = await db.collection('students').updateOne(
                {
                    name: { $regex: new RegExp(`^${student.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    stream: 'BCOM',
                    semester: 2,
                    isActive: true
                },
                {
                    $set: {
                        studentID: student.newID,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.modifiedCount > 0) {
                console.log(`✅ ${student.name} → ${student.newID}`);
            } else {
                console.log(`⚠️ ${student.name} - not found or already updated`);
            }
        }

        // Final list
        const finalStudents = await db.collection('students')
            .find({ stream: 'BCOM', semester: 2, isActive: true })
            .project({ studentID: 1, name: 1, _id: 0 })
            .sort({ studentID: 1 })
            .toArray();

        console.log(`\n📚 Final BCOM Sem 2 list (${finalStudents.length} students):`);
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

fixShaliniAndRemaining();
