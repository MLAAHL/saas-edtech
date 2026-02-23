// Script to fix BCOM Sem 2 student IDs to correct format U18ER25C00XX
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function fixStudentIDs() {
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

        // Correct student data with U18ER25C00XX format
        const correctData = [
            { name: 'A AMREEN KHANUM', newID: 'U18ER25C0022' },
            { name: 'A S AKSHAY KUMAR', newID: 'U18ER25C0023' },
            { name: 'AKASH N', newID: 'U18ER25C0024' },
            { name: 'ALAN PAUL A', newID: 'U18ER25C0025' },
            { name: 'ANJALI M', newID: 'U18ER25C0026' },
            { name: 'ARATHI M', newID: 'U18ER25C0027' },
            { name: 'AROGYA JESLIN S', newID: 'U18ER25C0028' },
            { name: 'BENAKA PRASAD S', newID: 'U18ER25C0029' },
            { name: 'CHANDANA S', newID: 'U18ER25C0030' },
            { name: 'DEEPTHI S', newID: 'U18ER25C0031' },
            { name: 'DINAKAR N', newID: 'U18ER25C0032' },
            { name: 'HARINI R', newID: 'U18ER25C0033' },
            { name: 'HARSHINI S', newID: 'U18ER25C0034' },
            { name: 'HARSHITHA T K', newID: 'U18ER25C0035' },
            { name: 'HEMASHREE H', newID: 'U18ER25C0036' },
            { name: 'HIMANISH K', newID: 'U18ER25C0037' },
            { name: 'INCHARA M', newID: 'U18ER25C0038' },
            { name: 'JAYASHREE', newID: 'U18ER25C0039' },
            { name: 'K J THIMMAIAH', newID: 'U18ER25C0040' },
            { name: 'KASHIF A', newID: 'U18ER25C0041' },
            { name: 'KEERTHANA S', newID: 'U18ER25C0042' },
            { name: 'KEERTHI BAI K', newID: 'U18ER25C0043' },
            { name: 'LIKITH GOWDA', newID: 'U18ER25C0044' },
            { name: 'LOKESH G', newID: 'U18ER25C0045' },
            { name: 'M GOPIKA', newID: 'U18ER25C0046' },
            { name: 'M MONIKA SHREE', newID: 'U18ER25C0047' },
            { name: 'M MOULIKA', newID: 'U18ER25C0048' },
            { name: 'M NAVEENKUMAR', newID: 'U18ER25C0049' },
            { name: 'MAHITH G', newID: 'U18ER25C0050' },
            { name: 'MADAN R', newID: 'U18ER25C0051' },
            { name: 'MANOJ S', newID: 'U18ER25C0052' },
            { name: 'MEENAKSHI P M', newID: 'U18ER25C0053' },
            { name: 'MEGHANA', newID: 'U18ER25C0054' },
            { name: 'NIKITHA K', newID: 'U18ER25C0055' },
            { name: 'NIKITHA M', newID: 'U18ER25C0056' },
            { name: 'NIMISHA J', newID: 'U18ER25C0057' },
            { name: 'NITHIN R', newID: 'U18ER25C0058' },
            { name: 'P P GOKUL', newID: 'U18ER25C0059' },
            { name: 'POORNIMA V', newID: 'U18ER25C0060' },
            { name: 'PRAJANA K T', newID: 'U18ER25C0061' },
            { name: 'PRIYA DARSHINI', newID: 'U18ER25C0062' },
            { name: 'PRUTHVI M U', newID: 'U18ER25C0063' },
            { name: 'S PRAGNA', newID: 'U18ER25C0064' },
            { name: 'S RANGANATH', newID: 'U18ER25C0065' },
            { name: 'SAHANA SHARANAPPA HAKARI', newID: 'U18ER25C0066' },
            { name: 'SANJANA V', newID: 'U18ER25C0067' },
            { name: 'SANJAY S', newID: 'U18ER25C0068' },
            { name: 'SHAHID PASHA', newID: 'U18ER25C0069' },
            { name: 'SHAKTHI MONIKA A', newID: 'U18ER25C0070' },
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

        console.log('📊 Fixing BCOM Semester 2 student IDs...\n');

        let updated = 0;
        let notFound = [];

        for (const student of correctData) {
            // Find by name (case insensitive) in BCOM Sem 2
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
                updated++;
            } else {
                notFound.push(student.name);
            }
        }

        // Also fix S SHALINI if it has wrong ID
        const shaliniResult = await db.collection('students').updateOne(
            {
                name: { $regex: /S\s*SHALINI/i },
                stream: 'BCOM',
                semester: 2,
                isActive: true
            },
            {
                $set: {
                    studentID: 'U18ER25C0071',
                    updatedAt: new Date()
                }
            }
        );

        if (shaliniResult.modifiedCount > 0) {
            console.log(`✅ S SHALINI → U18ER25C0071`);
            updated++;
        }

        console.log('\n══════════════════════════════════════════════════');
        console.log(`📊 SUMMARY:`);
        console.log(`   ✅ Updated: ${updated} students`);
        if (notFound.length > 0) {
            console.log(`   ⚠️ Not found: ${notFound.length} students`);
            notFound.forEach(name => console.log(`      - ${name}`));
        }

        // Show final list
        const finalStudents = await db.collection('students')
            .find({ stream: 'BCOM', semester: 2, isActive: true })
            .project({ studentID: 1, name: 1, _id: 0 })
            .sort({ studentID: 1 })
            .toArray();

        console.log(`\n📌 Final BCOM Sem 2 students: ${finalStudents.length}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

fixStudentIDs();
