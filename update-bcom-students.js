// Script to update BCOM Sem 2 student IDs and add new students
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

// New student data from Excel (extracted from image)
const newStudentData = [
    { newID: 'U1SER2SC0022', name: 'A AMREEN KHANUM', possibleNames: ['AMREEN KHANUM A', 'A AMREEN KHANUM'] },
    { newID: 'U1SER2SC0023', name: 'A S AKSHAY KUMAR', possibleNames: ['AKSHAY KUMAR A S', 'A S AKSHAY KUMAR'] },
    { newID: 'U1SER2SC0024', name: 'AKASH N', possibleNames: ['AKASH N'] },
    { newID: 'U1SER2SC0025', name: 'ALAN PAUL A', possibleNames: ['ALAN PAUL A'] },
    { newID: 'U1SER2SC0026', name: 'ANJALI M', possibleNames: ['ANJALI M'] },
    { newID: 'U1SER2SC0027', name: 'ARATHI M', possibleNames: ['ARATHI M'], isNew: true },
    { newID: 'U1SER2SC0028', name: 'AROGYA JESLIN S', possibleNames: ['AROGYA JESLIN S', 'AROGYA JESLIN.S'] },
    { newID: 'U1SER2SC0029', name: 'BENAKA PRASAD S', possibleNames: ['BENAKA PRASAD S'] },
    { newID: 'U1SER2SC0030', name: 'CHANDANA S', possibleNames: ['CHANDANA S'] },
    { newID: 'U1SER2SC0031', name: 'DEEPTHI S', possibleNames: ['DEEPTHI S'] },
    { newID: 'U1SER2SC0032', name: 'DINAKAR N', possibleNames: ['DINAKAR N'] },
    { newID: 'U1SER2SC0033', name: 'HARINI R', possibleNames: ['HARINI R'] },
    { newID: 'U1SER2SC0034', name: 'HARSHINI S', possibleNames: ['HARSHINI S'] },
    { newID: 'U1SER2SC0035', name: 'HARSHITHA T K', possibleNames: ['HARSHITHA T K'] },
    { newID: 'U1SER2SC0036', name: 'HEMASHREE H', possibleNames: ['HEMASHREE H'] },
    { newID: 'U1SER2SC0037', name: 'HIMANISH K', possibleNames: ['HIMANISH K'] },
    { newID: 'U1SER2SC0038', name: 'INCHARA M', possibleNames: ['INCHARA M'] },
    { newID: 'U1SER2SC0039', name: 'JAYASHREE', possibleNames: ['JAYASHREE S', 'JAYASHREE'] },
    { newID: 'U1SER2SC0040', name: 'K J THIMMAIAH', possibleNames: ['K J THIMMAIAH'] },
    { newID: 'U1SER2SC0041', name: 'KASHIF A', possibleNames: ['KASHIF A'] },
    { newID: 'U1SER2SC0042', name: 'KEERTHANA S', possibleNames: ['KEERTHANA S'] },
    { newID: 'U1SER2SC0043', name: 'KEERTHI BAI K', possibleNames: ['KEERTHI BAI K'] },
    { newID: 'U1SER2SC0044', name: 'LIKITH GOWDA', possibleNames: ['LIKITH GOWDA N', 'LIKITH GOWDA'] },
    { newID: 'U1SER2SC0045', name: 'LOKESH G', possibleNames: ['LOKESH G'] },
    { newID: 'U1SER2SC0046', name: 'M GOPIKA', possibleNames: ['M GOPIKA', 'GOPIKA M'], isNew: true },
    { newID: 'U1SER2SC0047', name: 'M MONIKA SHREE', possibleNames: ['MONIKASHREE M', 'M MONIKA SHREE'] },
    { newID: 'U1SER2SC0048', name: 'M MOULIKA', possibleNames: ['MOULIKA M', 'M MOULIKA'] },
    { newID: 'U1SER2SC0049', name: 'M NAVEENKUMAR', possibleNames: ['M NAVEEN KUMAR', 'M NAVEENKUMAR'] },
    { newID: 'U1SER2SC0050', name: 'MAHITH G', possibleNames: ['MAHITH G'] },
    { newID: 'U1SER2SC0051', name: 'MANOJ S', possibleNames: ['MANOJ S'], isNew: true },
    { newID: 'U1SER2SC0052', name: 'MADAN R', possibleNames: ['MADAN R'] },
    { newID: 'U1SER2SC0053', name: 'MEENAKSHI P M', possibleNames: ['MEENAKSHI P M'] },
    { newID: 'U1SER2SC0054', name: 'MEGHANA', possibleNames: ['MEGHANA R', 'MEGHANA'] },
    { newID: 'U1SER2SC0055', name: 'NIKITHA K', possibleNames: ['NIKITHA K'] },
    { newID: 'U1SER2SC0056', name: 'NIKITHA M', possibleNames: ['NIKITHA M'] },
    { newID: 'U1SER2SC0057', name: 'NIMISHA J', possibleNames: ['J NIMISHA', 'NIMISHA J'] },
    { newID: 'U1SER2SC0058', name: 'NITHIN R', possibleNames: ['NITHIN R'] },
    { newID: 'U1SER2SC0059', name: 'P P GOKUL', possibleNames: ['GOKUL P P', 'P P GOKUL'] },
    { newID: 'U1SER2SC0060', name: 'POORNIMA V', possibleNames: ['POORNIMA V'] },
    { newID: 'U1SER2SC0061', name: 'PRAJANA K T', possibleNames: ['PRAJANA K T'] },
    { newID: 'U1SER2SC0062', name: 'PRIYA DARSHINI', possibleNames: ['PRIYA DARSHINI'], isNew: true },
    { newID: 'U1SER2SC0063', name: 'PRUTHVI M U', possibleNames: ['PRUTHVI M U'] },
    { newID: 'U1SER2SC0064', name: 'S PRAGNA', possibleNames: ['S PRAGNA'] },
    { newID: 'U1SER2SC0065', name: 'S RANGANATH', possibleNames: ['RANGANATH S', 'S RANGANATH'] },
    { newID: 'U1SER2SC0066', name: 'SAHANA SHARANAPPA HAKARI', possibleNames: ['SAHANA SHARANAPPA HAKARI', 'SAHANA SHARANAPPA HAKAR'] },
    { newID: 'U1SER2SC0067', name: 'SANJANA V', possibleNames: ['SANJANA V'] },
    { newID: 'U1SER2SC0068', name: 'SANJAY S', possibleNames: ['SANJAY S'] },
    { newID: 'U1SER2SC0069', name: 'SHAHID PASHA', possibleNames: ['SHAHID PASHA'] },
    { newID: 'U1SER2SC0070', name: 'SHAKTHI MONIKA A', possibleNames: ['SHAKTHI MONIKA A'] },
    { newID: 'U1SER2SC0071', name: 'SHALINI S', possibleNames: ['SHALINI S', 'S SHALINI'] },
    { newID: 'U1SER2SC0072', name: 'SHWETHA BAI R', possibleNames: ['SHWETHA BAI R'] },
    { newID: 'U1SER2SC0073', name: 'SONU S', possibleNames: ['SONU S'] },
    { newID: 'U1SER2SC0074', name: 'SPANDANA B', possibleNames: ['SPANDANA B'] },
    { newID: 'U1SER2SC0075', name: 'SPANDANA C', possibleNames: ['SPANDANA C'] },
    { newID: 'U1SER2SC0076', name: 'SUHAS K', possibleNames: ['SUHAS K'] },
    { newID: 'U1SER2SC0077', name: 'TEJASWINI A', possibleNames: ['TEJASWINI A'] },
    { newID: 'U1SER2SC0078', name: 'TEJASWINI C', possibleNames: ['TEJASWINI C'] },
    { newID: 'U1SER2SC0079', name: 'VISHAL S', possibleNames: ['VISHAL S'] }
];

async function updateStudents() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ MONGODB_URI not found');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();
        const studentsCollection = db.collection('students');

        let updatedCount = 0;
        let addedCount = 0;
        let notFoundCount = 0;
        const notFound = [];

        console.log('📊 Processing BCOM Semester 2 students...\n');

        for (const studentData of newStudentData) {
            // Try to find existing student by any of the possible names
            let existingStudent = null;

            for (const possibleName of studentData.possibleNames) {
                existingStudent = await studentsCollection.findOne({
                    name: { $regex: new RegExp(`^${possibleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    stream: 'BCOM',
                    semester: 2
                });

                if (existingStudent) break;
            }

            if (existingStudent) {
                // Update existing student's ID
                const result = await studentsCollection.updateOne(
                    { _id: existingStudent._id },
                    {
                        $set: {
                            studentID: studentData.newID,
                            name: studentData.name, // Also update name to new format
                            updatedAt: new Date()
                        }
                    }
                );

                if (result.modifiedCount > 0) {
                    console.log(`✅ Updated: ${existingStudent.name} → ${studentData.name} (${studentData.newID})`);
                    updatedCount++;
                } else {
                    console.log(`ℹ️  No change: ${studentData.name} (already up to date)`);
                }
            } else if (studentData.isNew) {
                // Add new student
                const newStudent = {
                    studentID: studentData.newID,
                    name: studentData.name,
                    stream: 'BCOM',
                    semester: 2,
                    parentPhone: '',
                    languageSubject: '',
                    electiveSubject: '',
                    academicYear: 2025,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                await studentsCollection.insertOne(newStudent);
                console.log(`➕ Added NEW: ${studentData.name} (${studentData.newID})`);
                addedCount++;
            } else {
                console.log(`❌ Not found: ${studentData.name}`);
                notFound.push(studentData.name);
                notFoundCount++;
            }
        }

        console.log('\n' + '═'.repeat(50));
        console.log('📊 SUMMARY:');
        console.log(`   ✅ Updated: ${updatedCount} students`);
        console.log(`   ➕ Added: ${addedCount} new students`);
        console.log(`   ❌ Not found: ${notFoundCount} students`);

        if (notFound.length > 0) {
            console.log('\n⚠️  Students not found in database:');
            notFound.forEach(name => console.log(`   - ${name}`));
        }

        // Verify final count
        const finalCount = await studentsCollection.countDocuments({
            stream: 'BCOM',
            semester: 2,
            isActive: true
        });
        console.log(`\n📌 Total BCOM Sem 2 students now: ${finalCount}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

updateStudents();
