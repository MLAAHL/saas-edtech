require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function addStudents() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();

    const newStudents = [
        { usn: 'U18ER24C0070', name: 'ADITHYA S', language: 'SANSKRIT' },
        { usn: 'U18ER24C0071', name: 'ANAKARLA VENKATESH', language: 'KANNADA' },
        { usn: 'U18ER24C0072', name: 'B JAYASRI', language: 'SANSKRIT' },
        { usn: 'U18ER24C0073', name: 'B K HRITHWIK', language: 'KANNADA' },
        { usn: 'U18ER24C0074', name: 'BHARGAV M V', language: 'KANNADA' },
        { usn: 'U18ER24C0075', name: 'BHAVANA B S', language: 'KANNADA' },
        { usn: 'U18ER24C0076', name: 'BHAVANA R M', language: 'KANNADA' },
        { usn: 'U18ER24C0077', name: 'CHANDANA C M', language: 'KANNADA' },
        { usn: 'U18ER24C0078', name: 'CHARU KEERTHI S', language: 'KANNADA' },
        { usn: 'U18ER24C0079', name: 'DEEKSHA Y', language: 'KANNADA' },
        { usn: 'U18ER24C0080', name: 'DHANUSH A', language: 'KANNADA' },
        { usn: 'U18ER24C0081', name: 'DHANUSH M', language: 'KANNADA' },
        { usn: 'U18ER24C0082', name: 'EIKSHU L N', language: 'HINDI' },
        { usn: 'U18ER24C0083', name: 'G VENKATA PAVITHRA', language: 'SANSKRIT' },
        { usn: 'U18ER24C0085', name: 'HIMABINDU D', language: 'KANNADA' },
        { usn: 'U18ER24C0086', name: 'I MAMATHA BAI', language: 'KANNADA' },
        { usn: 'U18ER24C0087', name: 'J DEEKSHITHA', language: 'HINDI' },
        { usn: 'U18ER24C0088', name: 'JYOTHIKA', language: 'KANNADA' },
        { usn: 'U18ER24C0089', name: 'K SHARVANI', language: 'KANNADA' },
        { usn: 'U18ER24C0090', name: 'KAVYA V', language: 'HINDI' },
        { usn: 'U18ER24C0091', name: 'KEERTHAN GOWDA K', language: 'KANNADA' },
        { usn: 'U18ER24C0092', name: 'KULSUM G S', language: 'HINDI' },
        { usn: 'U18ER24C0093', name: 'LAKSHMI BAI R', language: 'HINDI' },
        { usn: 'U18ER24C0095', name: 'LEELAVATHI', language: 'KANNADA' },
        { usn: 'U18ER24C0098', name: 'M SUJATHA', language: 'KANNADA' },
        { usn: 'U18ER24C0099', name: 'MADHAVA M', language: 'KANNADA' },
        { usn: 'U18ER24C0100', name: 'MANASA B', language: 'KANNADA' },
        { usn: 'U18ER24C0101', name: 'MEERA R', language: 'KANNADA' },
        { usn: 'U18ER24C0102', name: 'MIRUDULLA V', language: 'SANSKRIT' },
        { usn: 'U18ER24C0103', name: 'N PREETHAM', language: 'KANNADA' },
        { usn: 'U18ER24C0104', name: 'NAVANITH R', language: 'KANNADA' },
        { usn: 'U18ER24C0105', name: 'NAYANA K S', language: 'KANNADA' },
        { usn: 'U18ER24C0106', name: 'NIRANJAN K', language: 'KANNADA' },
        { usn: 'U18ER24C0107', name: 'PAVAN RAJ', language: 'KANNADA' },
        { usn: 'U18ER24C0108', name: 'POORNIMA', language: 'KANNADA' },
        { usn: 'U18ER24C0109', name: 'POORNIMA S', language: 'KANNADA' },
        { usn: 'U18ER24C0111', name: 'PRAKRUTHI R', language: 'KANNADA' },
        { usn: 'U18ER24C0112', name: 'PRATHIKSHAA V', language: 'KANNADA' },
        { usn: 'U18ER24C0114', name: 'R DHANUSH KUMAR', language: 'KANNADA' },
        { usn: 'U18ER24C0115', name: 'R LASYA', language: 'KANNADA' },
        { usn: 'U18ER24C0116', name: 'R NITHIISHA', language: 'SANSKRIT' },
        { usn: 'U18ER24C0117', name: 'R ROHITH', language: 'KANNADA' },
        { usn: 'U18ER24C0118', name: 'RAKESH K', language: 'KANNADA' },
        { usn: 'U18ER24C0119', name: 'RAKSHA R', language: 'KANNADA' },
        { usn: 'U18ER24C0120', name: 'RITHIKA K', language: 'HINDI' },
        { usn: 'U18ER24C0121', name: 'S SHWETHA', language: 'HINDI' },
        { usn: 'U18ER24C0122', name: 'S SUSHMA', language: 'HINDI' },
        { usn: 'U18ER24C0123', name: 'SAI MANISH G', language: 'KANNADA' },
        { usn: 'U18ER24C0124', name: 'SANJANA P', language: 'KANNADA' },
        { usn: 'U18ER24C0126', name: 'SANTHOSH YADAV', language: 'KANNADA' },
        { usn: 'U18ER24C0127', name: 'SHAIKH ALFIYA FATHIMA', language: 'HINDI' },
        { usn: 'U18ER24C0128', name: 'SHREE KUMAR R', language: 'ADD. ENG' },
        { usn: 'U18ER24C0129', name: 'SHYAM M', language: 'KANNADA' },
        { usn: 'U18ER24C0130', name: 'SNEHA A', language: 'HINDI' },
        { usn: 'U18ER24C0132', name: 'SUBHASHREE PARIDA', language: 'HINDI' },
        { usn: 'U18ER24C0133', name: 'SUJATHA', language: 'SANSKRIT' },
        { usn: 'U18ER24C0134', name: 'T PRANATHI', language: 'KANNADA' },
        { usn: 'U18ER24C0135', name: 'TANISHA S', language: 'KANNADA' },
        { usn: 'U18ER24C0136', name: 'TEJASHWINI K V', language: 'KANNADA' },
        { usn: 'U18ER24C0137', name: 'VAISHNAVI M G', language: 'KANNADA' },
        { usn: 'U18ER24C0138', name: 'VIGNESH M', language: 'HINDI' }
    ];

    // Get existing students
    const existing = await db.collection('students').find({ stream: 'BCOM', semester: 4 }).toArray();
    const existingNames = existing.map(s => s.name.toUpperCase().trim());
    console.log('📊 Existing BCOM Sem 4 students:', existingNames.length);

    // Filter out students who already exist
    const toAdd = [];
    for (const student of newStudents) {
        if (!existingNames.includes(student.name.toUpperCase().trim())) {
            toAdd.push(student);
        }
    }
    
    console.log('📝 Students to add:', toAdd.length);

    if (toAdd.length > 0) {
        const docs = toAdd.map(s => ({
            studentID: s.usn,
            name: s.name,
            stream: 'BCOM',
            semester: 4,
            languageSubject: s.language,
            electiveSubject: '',
            academicYear: 2025,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        const result = await db.collection('students').insertMany(docs);
        console.log('✅ Added ' + result.insertedCount + ' new students:');
        toAdd.forEach(s => console.log('  + ' + s.usn + ' - ' + s.name));
    } else {
        console.log('✅ All students already exist');
    }

    // Final count
    const finalCount = await db.collection('students').countDocuments({ stream: 'BCOM', semester: 4 });
    console.log('\n📊 Total BCOM Sem 4 students now:', finalCount);

    await client.close();
}

addStudents().catch(console.error);
