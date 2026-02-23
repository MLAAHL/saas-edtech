const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './backend/.env' });

const studentData = [
  {id:'U1SER25C0080',name:'ADITHYA C',language:'KANNADA'},
  {id:'U1SER25C0081',name:'ADITI P JOSHI',language:'SANSKRIT'},
  {id:'U1SER25C0082',name:'AISHWARYA K',language:'KAN'},
  {id:'U1SER25C0083',name:'AKSHAYA S',language:'SANSKRIT'},
  {id:'U1SER25C0084',name:'AMRUTHA H N',language:'SANSKRIT'},
  {id:'U1SER25C0085',name:'APARNA P',language:'KAN'},
  {id:'U1SER25C0086',name:'BHAVANI N K',language:'KAN'},
  {id:'U1SER25C0087',name:'BHOOMIKA K N',language:'KAN'},
  {id:'U1SER25C0088',name:'CHAITHRA A',language:'KAN'},
  {id:'U1SER25C0089',name:'CHANDANA D',language:'HINDI'},
  {id:'U1SER25C0090',name:'CHANDANA G',language:'KAN'},
  {id:'U1SER25C0091',name:'CHANDANA M R',language:'KAN'},
  {id:'U1SER25C0092',name:'CHANDANA T',language:'SANSKRIT'},
  {id:'U1SER25C0093',name:'CHANDRIKA S',language:'HINDI'},
  {id:'U1SER25C0094',name:'CHITHSWAROOP B R',language:'KAN'},
  {id:'U1SER25C0095',name:'DARSHINI R (RAMAMURTHY S)',language:'SANSKRIT'},
  {id:'U1SER25C0096',name:'DARSHINI R (B S RAMU)',language:'SANSKRIT'},
  {id:'U1SER25C0097',name:'DEEPIKA N P',language:'KAN'},
  {id:'U1SER25C0098',name:'DEEPIKA R',language:'KAN'},
  {id:'U1SER25C0099',name:'DHANALAKSHMI K',language:'KAN'},
  {id:'U1SER25C0100',name:'DISHA I U',language:'KAN'},
  {id:'U1SER25C0101',name:'DISHA R M',language:'KAN'},
  {id:'U1SER25C0102',name:'DIVYA K',language:'KAN'},
  {id:'U1SER25C0103',name:'DIVYA SHREE S',language:'KAN'},
  {id:'U1SER25C0104',name:'DIVYASHREE G',language:'KAN'},
  {id:'U1SER25C0105',name:'G ANKITHA',language:'HINDI'},
  {id:'U1SER25C0106',name:'GAGANA A R',language:'KAN'},
  {id:'U1SER25C0107',name:'GANAVI GOWDA Y G',language:'KAN'},
  {id:'U1SER25C0108',name:'GANGAVARAPU MAMATHA',language:'KAN'},
  {id:'U1SER25C0109',name:'HEMALATHA R',language:'KAN'},
  {id:'U1SER25C0110',name:'JEEVITHA V',language:'KAN'},
  {id:'U1SER25C0111',name:'JYOTHI LAKSHMI',language:'KAN'},
  {id:'U1SER25C0112',name:'K RAMESH',language:'KAN'},
  {id:'U1SER25C0113',name:'K ROOPA SHREE',language:'HINDI'},
  {id:'U1SER25C0114',name:'K S MANOJ',language:'KAN'},
  {id:'U1SER25C0115',name:'KAVANA S',language:'KAN'},
  {id:'U1SER25C0116',name:'LAKSHYA N',language:'KAN'},
  {id:'U1SER25C0117',name:'LAXMI',language:'KAN'},
  {id:'U1SER25C0118',name:'LOHITH KUMAR B',language:'KAN'},
  {id:'U1SER25C0119',name:'M SANJANA',language:'KAN'},
  {id:'U1SER25C0120',name:'MADHUMITHA P',language:'KAN'},
  {id:'U1SER25C0121',name:'MANU S',language:'KAN'},
  {id:'U1SER25C0122',name:'MEGHANA K',language:'KAN'},
  {id:'U1SER25C0123',name:'NAGARATHNA H',language:'KAN'},
  {id:'U1SER25C0124',name:'NAMRATHA S',language:'KAN'},
  {id:'U1SER25C0125',name:'NANDINI M',language:'HINDI'},
  {id:'U1SER25C0126',name:'NEHA H S',language:'KAN'},
  {id:'U1SER25C0127',name:'NEHASHRI S',language:'HINDI'},
  {id:'U1SER25C0128',name:'NIRITHA BHANDARI',language:'SANSKRIT'},
  {id:'U1SER25C0129',name:'NITHYASHREE',language:'KAN'},
  {id:'U1SER25C0130',name:'NIVEDITHA S',language:'KAN'},
  {id:'U1SER25C0131',name:'POOJA M',language:'SANSKRIT'},
  {id:'U1SER25C0132',name:'PRAKRUTHI B',language:'KAN'},
  {id:'U1SER25C0133',name:'PRERANA K KUMAR',language:'KAN'},
  {id:'U1SER25C0134',name:'PRIYANKA M',language:'KAN'},
  {id:'U1SER25C0135',name:'PUNITH B A',language:'KAN'},
  {id:'U1SER25C0136',name:'R SARVAPAVANA',language:'HINDI'},
  {id:'U1SER25C0137',name:'ROHITH',language:'KAN'},
  {id:'U1SER25C0138',name:'RUCHITHA',language:'KAN'},
  {id:'U1SER25C0139',name:'SACHIN M C',language:'KAN'},
  {id:'U1SER25C0140',name:'SAHANA R',language:'KAN'},
  {id:'U1SER25C0141',name:'SAJANA V',language:'KAN'},
  {id:'U1SER25C0142',name:'SALONIYA P',language:'HINDI'},
  {id:'U1SER25C0143',name:'SANIYA',language:'SANSKRIT'},
  {id:'U1SER25C0144',name:'SANJAY S',language:'KAN'},
  {id:'U1SER25C0146',name:'SARALA DEVI G N',language:'KAN'},
  {id:'U1SER25C0147',name:'SHILPA V',language:'KAN'},
  {id:'U1SER25C0148',name:'SHREE MONIKA Y P',language:'KAN'},
  {id:'U1SER25C0149',name:'SHYLA SHREE',language:'KAN'},
  {id:'U1SER25C0150',name:'SINDHU N K',language:'KAN'},
  {id:'U1SER25C0151',name:'SOWJANYA Y M',language:'KAN'},
  {id:'U1SER25C0152',name:'SRIVISHNU S KEERTHI',language:'KAN'},
  {id:'U1SER25C0153',name:'SUHANI SINGH',language:'HINDI'},
  {id:'U1SER25C0154',name:'THANUSHREE H',language:'KAN'},
  {id:'U1SER25C0155',name:'UDAYA RAJ B V',language:'HINDI'},
  {id:'U1SER25C0156',name:'UME KULSUM',language:'KAN'},
  {id:'U1SER25C0157',name:'V DEVIKA',language:'KAN'},
  {id:'U1SER25C0158',name:'VAISHNAVI',language:'KAN'},
  {id:'U1SER25C0159',name:'VAISHNAVI M',language:'KAN'},
  {id:'U1SER25C0160',name:'VANISHREE RAMANUJAM',language:'KAN'},
  {id:'U1SER25C0161',name:'VARSHITHA N',language:'KAN'},
  {id:'U1SER25C0162',name:'VENKATA USHA P',language:'HINDI'},
  {id:'U1SER25C0163',name:'VISMITHA N',language:'KAN'}
];

// Name variations for matching
const nameVariations = {
  'G ANKITHA': ['ANKITHA G'],
  'JYOTHI LAKSHMI': ['JYOTHI LAKSHMI H'],
  'LAXMI': ['LAXMI BIRADAR'],
  'DIVYASHREE G': ['DIVYA SHREE G'],
  'SRIVISHNU S KEERTHI': ['SRIVISHNUSHKEERTHI']
};

async function updateStudents() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection('students');
  
  console.log('Starting BCom A&F Sem 2 student update...\n');
  
  let updated = 0;
  let added = 0;
  let notFound = [];
  
  // First, delete all existing BCom A&F Sem 2 students to start fresh
  const deleteResult = await col.deleteMany({ stream: 'BCom A&F', semester: 2 });
  console.log(`Deleted ${deleteResult.deletedCount} existing students`);
  
  // Insert all students fresh
  for (const s of studentData) {
    await col.insertOne({
      studentID: s.id,
      studentId: s.id,
      name: s.name,
      stream: 'BCom A&F',
      semester: 2,
      language: s.language,
      isActive: true,
      createdAt: new Date()
    });
    added++;
  }
  
  const total = await col.countDocuments({ stream: 'BCom A&F', semester: 2 });
  
  console.log('\n========== SUMMARY ==========');
  console.log(`Added: ${added} students`);
  console.log(`Total BCom A&F Sem 2 now: ${total}`);
  
  await client.close();
}

updateStudents().catch(console.error);
