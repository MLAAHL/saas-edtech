// Script to update BBA Sem 2 students - Update IDs, Add new, Remove missing
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

// New BBA Sem 2 student data from Excel (extracted from image)
const newStudentData = [
    { newID: 'U1SER2SM0001', name: 'A INFANT SHERLY', possibleNames: ['INFANT SHERLY A', 'A INFANT SHERLY'] },
    { newID: 'U1SER2SM0002', name: 'AISHWARYA M', possibleNames: ['AISHWARYA M'] },
    { newID: 'U1SER2SM0003', name: 'ANANYA P', possibleNames: ['ANANYA P'] },
    { newID: 'U1SER2SM0004', name: 'BHAVANI R', possibleNames: ['BHAVANI R'] },
    { newID: 'U1SER2SM0005', name: 'CHIRANJEEVI SHAKTHI V', possibleNames: ['CHIRANJEEVI SHAKTHI V'] },
    { newID: 'U1SER2SM0006', name: 'DARSHINI V', possibleNames: ['DARSHINI V'] },
    { newID: 'U1SER2SM0007', name: 'DHARSHAN S', possibleNames: ['DHARSHAN S'] },
    { newID: 'U1SER2SM0008', name: 'DIYASHRI SINGH G', possibleNames: ['DIYA SHRI SINGH G', 'DIYASHRI SINGH G'] },
    { newID: 'U1SER2SM0009', name: 'GAGANA G', possibleNames: ['GAGANA.G', 'GAGANA G'] },
    { newID: 'U1SER2SM0010', name: 'GAYATHRI C', possibleNames: ['GAYATHRI C'] },
    { newID: 'U1SER2SM0011', name: 'HAASINI N', possibleNames: ['HAASINI N'] },
    { newID: 'U1SER2SM0012', name: 'INCHARA M', possibleNames: ['INCHARA M'] },
    { newID: 'U1SER2SM0013', name: 'J YASHASWINI', possibleNames: ['YASHASWINI J', 'J YASHASWINI'] },
    { newID: 'U1SER2SM0014', name: 'KAVYA D', possibleNames: ['KAVYA D'] },
    { newID: 'U1SER2SM0015', name: 'KAVYA J', possibleNames: ['KAVYA J'] },
    { newID: 'U1SER2SM0016', name: 'KEERTHANA K', possibleNames: ['KEERTHANA K'] },
    { newID: 'U1SER2SM0017', name: 'MAHALAKSHMI N', possibleNames: ['MAHALAKSHMI N'] },
    { newID: 'U1SER2SM0018', name: 'MANTHAN A U', possibleNames: ['MANTHAN A U'] },
    { newID: 'U1SER2SM0019', name: 'MONIKA SINGH R', possibleNames: ['MONIKA SINGH R'] },
    { newID: 'U1SER2SM0020', name: 'N ISSAC', possibleNames: ['ISSAC N', 'N ISSAC'] },
    { newID: 'U1SER2SM0021', name: 'NANDINI KUMARI P', possibleNames: ['NANDINI KUMARI P'] },
    { newID: 'U1SER2SM0022', name: 'NAYANASHREE', possibleNames: ['NAYANASHREE'] },
    { newID: 'U1SER2SM0023', name: 'NIKHIL GOWDA B C', possibleNames: ['NIKHIL GOWDA B C'] },
    { newID: 'U1SER2SM0024', name: 'POOJA S V', possibleNames: ['POOJA S V'] },
    { newID: 'U1SER2SM0025', name: 'R CHANDANA', possibleNames: ['CHANDANA R', 'R CHANDANA'] },
    { newID: 'U1SER2SM0026', name: 'RAKSHA O R', possibleNames: ['RAKSHA O R'] },
    { newID: 'U1SER2SM0027', name: 'RITHIK A', possibleNames: ['RITHIK A'] },
    { newID: 'U1SER2SM0028', name: 'RUSHCHITHA M S', possibleNames: ['RUSHCHITHA M S'] },
    { newID: 'U1SER2SM0029', name: 'S KALPANA', possibleNames: ['KALPANA S', 'S KALPANA'] },
    { newID: 'U1SER2SM0030', name: 'S SAHANA', possibleNames: ['SAHANA S', 'S SAHANA'] },
    { newID: 'U1SER2SM0031', name: 'SAHANA L', possibleNames: ['SAHANA L'] },
    { newID: 'U1SER2SM0032', name: 'SAHANA R (RAVI)', possibleNames: ['SAHANA R (RAVI)'] },
    { newID: 'U1SER2SM0033', name: 'SAHANA R (RAJU D)', possibleNames: ['SAHANA R (RAJU D)'] },
    { newID: 'U1SER2SM0034', name: 'SANDEEP R', possibleNames: ['SANDEEP R'] },
    { newID: 'U1SER2SM0035', name: 'SANJANA V', possibleNames: ['SANJANA V'] },
    { newID: 'U1SER2SM0036', name: 'SATHYA NARAYAN M', possibleNames: ['SATHYA NARAYAN M'] },
    { newID: 'U1SER2SM0037', name: 'SHIRISHA M', possibleNames: ['SHIRISHA M'] },
    { newID: 'U1SER2SM0038', name: 'SHRUTHI A', possibleNames: ['SHRUTHI A'] },
    { newID: 'U1SER2SM0039', name: 'SHUBASHREE G', possibleNames: ['SUBHASHREE G', 'SHUBASHREE G'] },
    { newID: 'U1SER2SM0040', name: 'SPOORTHI R', possibleNames: ['SPOORTHI R'] },
    { newID: 'U1SER2SM0041', name: 'SRIDHAR S', possibleNames: ['SRIDHAR S'] },
    { newID: 'U1SER2SM0042', name: 'SRISHANTH P N', possibleNames: ['SRISHANTHA P N', 'SRISHANTH P N'] },
    { newID: 'U1SER2SM0043', name: 'SUBHASH RAJ B', possibleNames: ['SUBHASH RAJ B'] },
    { newID: 'U1SER2SM0044', name: 'SUHAS N', possibleNames: ['SUHAS N'] },
    { newID: 'U1SER2SM0045', name: 'THANMAIYE K', possibleNames: ['THANMAIYE K'] },
    { newID: 'U1SER2SM0046', name: 'THARUN P', possibleNames: ['THARUN P'] },
    { newID: 'U1SER2SM0047', name: 'U SHREYA', possibleNames: ['U SHREYA'] },
    { newID: 'U1SER2SM0048', name: 'V HASVITHA', possibleNames: ['V HASVITHA'] },
    { newID: 'U1SER2SM0049', name: 'VARSHEETHA E', possibleNames: ['VARSHEETHA E'] },
    { newID: 'U1SER2SM0050', name: 'VIDHYA S', possibleNames: ['VIDHYA S'] },
    { newID: 'U1SER2SM0051', name: 'WILSON P', possibleNames: ['WILSON P'] },
    { newID: 'U1SER2SM0052', name: 'YASHASWINI B', possibleNames: ['YASHASWINI B'] },
    { newID: 'U1SER2SM0053', name: 'YUVARAJ A', possibleNames: ['YUVARAJ A'] }
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
        const matchedIds = new Set(); // Track which existing students were matched

        console.log('📊 Processing BBA Semester 2 students...\n');

        // Get all current BBA Sem 2 students
        const currentStudents = await studentsCollection.find({
            stream: 'BBA',
            semester: 2
        }).toArray();

        console.log(`📌 Current students in database: ${currentStudents.length}\n`);

        // Process each student from new list
        for (const studentData of newStudentData) {
            let existingStudent = null;

            // Try to find existing student by any of the possible names
            for (const possibleName of studentData.possibleNames) {
                existingStudent = await studentsCollection.findOne({
                    name: { $regex: new RegExp(`^${possibleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    stream: 'BBA',
                    semester: 2
                });

                if (existingStudent) break;
            }

            if (existingStudent) {
                // Mark as matched
                matchedIds.add(existingStudent._id.toString());

                // Update existing student's ID
                const result = await studentsCollection.updateOne(
                    { _id: existingStudent._id },
                    {
                        $set: {
                            studentID: studentData.newID,
                            name: studentData.name,
                            updatedAt: new Date()
                        }
                    }
                );

                if (result.modifiedCount > 0) {
                    console.log(`✅ Updated: ${existingStudent.name} → ${studentData.name} (${studentData.newID})`);
                    updatedCount++;
                } else {
                    console.log(`ℹ️  No change: ${studentData.name}`);
                }
            } else {
                // Add new student
                const newStudent = {
                    studentID: studentData.newID,
                    name: studentData.name,
                    stream: 'BBA',
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
            }
        }

        // Find students to remove (in database but not in new list)
        const studentsToRemove = currentStudents.filter(s => !matchedIds.has(s._id.toString()));

        console.log('\n' + '─'.repeat(50));

        if (studentsToRemove.length > 0) {
            console.log(`\n🗑️  Removing ${studentsToRemove.length} students not in new list:`);

            for (const student of studentsToRemove) {
                console.log(`   ❌ Removing: ${student.name} (${student.studentID})`);
                await studentsCollection.deleteOne({ _id: student._id });
            }
        }

        console.log('\n' + '═'.repeat(50));
        console.log('📊 SUMMARY:');
        console.log(`   ✅ Updated: ${updatedCount} students`);
        console.log(`   ➕ Added: ${addedCount} new students`);
        console.log(`   🗑️  Removed: ${studentsToRemove.length} students`);

        // Verify final count
        const finalCount = await studentsCollection.countDocuments({
            stream: 'BBA',
            semester: 2,
            isActive: true
        });
        console.log(`\n📌 Total BBA Sem 2 students now: ${finalCount}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

updateStudents();
