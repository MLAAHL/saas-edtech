require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

async function updateBCASem6Elective() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI not found in environment variables');
        return;
    }
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db();
        
        // Find all BCA Sem 6 students
        const students = await db.collection('students').find({
            stream: 'BCA',
            semester: 6
        }).toArray();
        
        console.log(`\n📚 Found ${students.length} BCA Sem 6 students`);
        
        if (students.length === 0) {
            console.log('No students found!');
            return;
        }
        
        // Show current electives
        console.log('\n📋 Current electives:');
        const electiveCounts = {};
        students.forEach(s => {
            const elective = s.electiveSubject || s.elective || 'Not Set';
            electiveCounts[elective] = (electiveCounts[elective] || 0) + 1;
        });
        Object.entries(electiveCounts).forEach(([elective, count]) => {
            console.log(`   ${elective}: ${count} students`);
        });
        
        // Update all to SOFTWARE TESTING (using electiveSubject field based on schema)
        const result = await db.collection('students').updateMany(
            { stream: 'BCA', semester: 6 },
            { $set: { electiveSubject: 'SOFTWARE TESTING', elective: 'SOFTWARE TESTING' } }
        );
        
        console.log(`\n✅ Updated ${result.modifiedCount} students to elective: SOFTWARE TESTING`);
        
        // Verify the update
        const updatedStudents = await db.collection('students').find({
            stream: 'BCA',
            semester: 6
        }).toArray();
        
        console.log('\n📋 After update:');
        const newElectiveCounts = {};
        updatedStudents.forEach(s => {
            const elective = s.electiveSubject || s.elective || 'Not Set';
            newElectiveCounts[elective] = (newElectiveCounts[elective] || 0) + 1;
        });
        Object.entries(newElectiveCounts).forEach(([elective, count]) => {
            console.log(`   ${elective}: ${count} students`);
        });
        
        // Show sample student
        if (updatedStudents.length > 0) {
            console.log('\n📄 Sample updated student:');
            console.log(`   Name: ${updatedStudents[0].name}`);
            console.log(`   electiveSubject: ${updatedStudents[0].electiveSubject}`);
            console.log(`   elective: ${updatedStudents[0].elective}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

updateBCASem6Elective();
