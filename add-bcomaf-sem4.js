require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

const newStudents = [
    { usn: 'U18ER24C0035', name: 'AKSHATHA A', language: 'KANNADA' },
    { usn: 'U18ER24C0036', name: 'AKSHAYA S', language: 'KANNADA' },
    { usn: 'U18ER24C0037', name: 'AMRUTHA V', language: 'KANNADA' },
    { usn: 'U18ER24C0038', name: 'AMULYA S', language: 'KANNADA' },
    { usn: 'U18ER24C0039', name: 'ANJALI', language: 'KANNADA' },
    { usn: 'U18ER24C0040', name: 'ANUSHA S', language: 'KANNADA' },
    { usn: 'U18ER24C0041', name: 'ASHWINI M', language: 'KANNADA' },
    { usn: 'U18ER24C0042', name: 'B ANUSHA', language: 'KANNADA' },
    { usn: 'U18ER24C0044', name: 'BHAGYALAKSHMI S K', language: 'KANNADA' },
    { usn: 'U18ER24C0045', name: 'BHARGAVI N', language: 'KANNADA' },
    { usn: 'U18ER24C0046', name: 'D GAGANA', language: 'KANNADA' },
    { usn: 'U18ER24C0047', name: 'D SUBHASHREE', language: 'SANSKRIT' },
    { usn: 'U18ER24C0048', name: 'GAYANA K', language: 'KANNADA' },
    { usn: 'U18ER24C0049', name: 'HARINI C', language: 'KANNADA' },
    { usn: 'U18ER24C0050', name: 'HARINI S', language: 'KANNADA' },
    { usn: 'U18ER24C0051', name: 'HARSHITHA R', language: 'KANNADA' },
    { usn: 'U18ER24C0052', name: 'HEMA S', language: 'KANNADA' },
    { usn: 'U18ER24C0053', name: 'JAHNAVI N', language: 'KANNADA' },
    { usn: 'U18ER24C0054', name: 'JYOTHIKA', language: 'KANNADA' },
    { usn: 'U18ER24C0055', name: 'MAMATHA M', language: 'SANSKRIT' },
    { usn: 'U18ER24C0056', name: 'MANASA R', language: 'KANNADA' },
    { usn: 'U18ER24C0057', name: 'MONICA N', language: 'KANNADA' },
    { usn: 'U18ER24C0058', name: 'NAGAVENI B R', language: 'KANNADA' },
    { usn: 'U18ER24C0059', name: 'POOJITHA R', language: 'SANSKRIT' },
    { usn: 'U18ER24C0060', name: 'RAKSHITHA M', language: 'HINDI' },
    { usn: 'U18ER24C0061', name: 'ROHITH A', language: 'KANNADA' },
    { usn: 'U18ER24C0062', name: 'S VANSHI SRINATH', language: 'KANNADA' },
    { usn: 'U18ER24C0063', name: 'SHIVANI B V', language: 'KANNADA' },
    { usn: 'U18ER24C0064', name: 'SHREYA S', language: 'KANNADA' },
    { usn: 'U18ER24C0066', name: 'SRILAKSHMI H P', language: 'SANSKRIT' },
    { usn: 'U18ER24C0067', name: 'SWANDANA M', language: 'KANNADA' },
    { usn: 'U18ER24C0068', name: 'THANUSHA L', language: 'KANNADA' },
    { usn: 'U18ER24C0069', name: 'V MADHUMITHA', language: 'KANNADA' }
];

async function run() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Get existing students
    const existing = await db.collection('students').find({ stream: 'BCom A&F', semester: 4 }).toArray();
    const existingUSNs = existing.map(s => s.studentID);
    console.log('Existing BCom A&F Sem 4:', existing.length);

    // Add only missing students
    let added = 0;
    for (const s of newStudents) {
        if (!existingUSNs.includes(s.usn)) {
            await db.collection('students').insertOne({
                studentID: s.usn,
                name: s.name,
                stream: 'BCom A&F',
                semester: 4,
                languageSubject: s.language,
                electiveSubject: '',
                academicYear: 2025,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log('  +', s.usn, '-', s.name);
            added++;
        }
    }

    console.log('\n✅ Added:', added, 'students');
    
    const total = await db.collection('students').countDocuments({ stream: 'BCom A&F', semester: 4 });
    console.log('📊 Total BCom A&F Sem 4 now:', total);

    await client.close();
}

run().catch(console.error);
