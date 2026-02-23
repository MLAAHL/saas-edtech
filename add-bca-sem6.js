require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

const newStudents = [
    { usn: 'U18ER23S0001', name: 'AAAFREEN NIKKHATH' },
    { usn: 'U18ER23S0002', name: 'AARTHI M' },
    { usn: 'U18ER23S0003', name: 'SANJANA M V' },
    { usn: 'U18ER23S0004', name: 'ANITHA G' },
    { usn: 'U18ER23S0005', name: 'SANDHYA K' },
    { usn: 'U18ER23S0006', name: 'ABHISHEK SHARMA N' },
    { usn: 'U18ER23S0007', name: 'ANANYA C V' },
    { usn: 'U18ER23S0008', name: 'ARCHANA M' },
    { usn: 'U18ER23S0009', name: 'ASHWINI S P' },
    { usn: 'U18ER23S0010', name: 'B SANGEETHA' },
    { usn: 'U18ER23S0011', name: 'BHAVYA S' },
    { usn: 'U18ER23S0012', name: 'CHANDANA B' },
    { usn: 'U18ER23S0013', name: 'CHEERLADINNE NAGAMOHITH' },
    { usn: 'U18ER23S0014', name: 'DEEKSHITHA V' },
    { usn: 'U18ER23S0015', name: 'DIVYASHREE U' },
    { usn: 'U18ER23S0016', name: 'MEGHANA G' },
    { usn: 'U18ER23S0017', name: 'GAGANA SHREE M' },
    { usn: 'U18ER23S0018', name: 'GOVARDHAN N C' },
    { usn: 'U18ER23S0019', name: 'HAJEERA I' },
    { usn: 'U18ER23S0020', name: 'HARINI P' },
    { usn: 'U18ER23S0021', name: 'HARSHINI C RAO' },
    { usn: 'U18ER23S0022', name: 'IMPANA P' },
    { usn: 'U18ER23S0023', name: 'JAISHANKAR G' },
    { usn: 'U18ER23S0025', name: 'KEERTHANA P' },
    { usn: 'U18ER23S0026', name: 'KEERTHANA S' },
    { usn: 'U18ER23S0027', name: 'KEERTHI R' },
    { usn: 'U18ER23S0028', name: 'KOWSHIK NAIK' },
    { usn: 'U18ER23S0029', name: 'KUMAR R' },
    { usn: 'U18ER23S0030', name: 'KUSUMA V' },
    { usn: 'U18ER23S0031', name: 'LAKSHITHA G G' },
    { usn: 'U18ER23S0032', name: 'LAVANYA H K' },
    { usn: 'U18ER23S0033', name: 'MADHUSUDHAN R' },
    { usn: 'U18ER23S0034', name: 'NARENDRA SINGH' },
    { usn: 'U18ER23S0035', name: 'NAYANA K' },
    { usn: 'U18ER23S0037', name: 'NISHA ROKAYA' },
    { usn: 'U18ER23S0038', name: 'PALLAVI A' },
    { usn: 'U18ER23S0040', name: 'PRIYANAKA L' },
    { usn: 'U18ER23S0041', name: 'R HARSHITHA' },
    { usn: 'U18ER23S0042', name: 'RACHITHA P' },
    { usn: 'U18ER23S0043', name: 'RAKSHITHA G K' },
    { usn: 'U18ER23S0044', name: 'RAKSHITHA P B' },
    { usn: 'U18ER23S0045', name: 'S MURUGAN' },
    { usn: 'U18ER23S0046', name: 'S NANDHIVARDHANA' },
    { usn: 'U18ER23S0047', name: 'SANJANA S' },
    { usn: 'U18ER23S0048', name: 'SANJAY' },
    { usn: 'U18ER23S0049', name: 'SANTHOSH R' },
    { usn: 'U18ER23S0050', name: 'SHAHIDHA NASREEN M' },
    { usn: 'U18ER23S0051', name: 'SHIVA KUMAR T S' },
    { usn: 'U18ER23S0052', name: 'SHOBHA N' },
    { usn: 'U18ER23S0053', name: 'SHREYAS J' },
    { usn: 'U18ER23S0054', name: 'SHREYAS Y S' },
    { usn: 'U18ER23S0055', name: 'SHRUTHI N' },
    { usn: 'U18ER23S0056', name: 'TASMIYA KAUSAR' },
    { usn: 'U18ER23S0057', name: 'TEJU N' },
    { usn: 'U18ER23S0058', name: 'THANUSHREE A' },
    { usn: 'U18ER23S0059', name: 'VARSHA JADHAV' },
    { usn: 'U18ER23S0060', name: 'YASHASWINI S KUMAR' },
    { usn: 'U18LI23S0002', name: 'PRIYANKA U R' }
];

async function run() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();

    // Get existing students
    const existing = await db.collection('students').find({ stream: 'BCA', semester: 6 }).toArray();
    const existingUSNs = existing.map(s => s.studentID);
    console.log('Existing BCA Sem 6:', existing.length);

    // Add only missing students
    let added = 0;
    for (const s of newStudents) {
        if (!existingUSNs.includes(s.usn)) {
            await db.collection('students').insertOne({
                studentID: s.usn,
                name: s.name,
                stream: 'BCA',
                semester: 6,
                languageSubject: '',
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
    
    const total = await db.collection('students').countDocuments({ stream: 'BCA', semester: 6 });
    console.log('📊 Total BCA Sem 6 now:', total);

    await client.close();
}

run().catch(console.error);
