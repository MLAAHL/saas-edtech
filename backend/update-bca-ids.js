const { MongoClient } = require('mongodb');
require('dotenv').config();

const idUpdates = [
  {name: 'AJAY KUMAR L', newId: 'U18ER25S0001'},
  {name: 'AJITH KUMAR C', newId: 'U18ER25S0002'},
  {name: 'ANGEL JULIET M', newId: 'U18ER25S0003'},
  {name: 'CHARAN REDDY K L', newId: 'U18ER25S0004'},
  {name: 'GAGAN C', newId: 'U18ER25S0005'},
  {name: 'GIRIJA S', newId: 'U18ER25S0006'},
  {name: 'GOKUL PRIYA T', newId: 'U18ER25S0007'},
  {name: 'INCHARA A V', newId: 'U18ER25S0009'},
  {name: 'JAISHREE V', newId: 'U18ER25S0010'},
  {name: 'KHUSHI GUPTA', newId: 'U18ER25S0011'},
  {name: 'KUMARI SAPNA B', newId: 'U18ER25S0012'},
  {name: 'SAPNA B', newId: 'U18ER25S0012'},  // Alternative name
  {name: 'MEGHA N', newId: 'U18ER25S0013'},
  {name: 'MONICA P', newId: 'U18ER25S0014'},
  {name: 'NANDAN H P', newId: 'U18ER25S0015'},
  {name: 'NISARGA V', newId: 'U18ER25S0016'},
  {name: 'PRAJWAL G K', newId: 'U18ER25S0017'},
  {name: 'PRATHAP J', newId: 'U18ER25S0018'},
  {name: 'PREMA N', newId: 'U18ER25S0019'},
  {name: 'RAMYA M', newId: 'U18ER25S0020'},
  {name: 'RENUKAMMA M B', newId: 'U18ER25S0021'},
  {name: 'RIMPI KUMARI D', newId: 'U18ER25S0022'},
  {name: 'SAHANA SHREE S', newId: 'U18ER25S0023'},
  {name: 'SINDHU B', newId: 'U18ER25S0024'},
  {name: 'SRIDHAR E', newId: 'U18ER25S0025'},
  {name: 'SUDARSHAN K', newId: 'U18ER25S0026'},
  {name: 'THILAK LALATE G', newId: 'U18ER25S0027'},
  {name: 'VARSHA K', newId: 'U18ER25S0028'},
  {name: 'VIJAYA LAKSHMI', newId: 'U18ER25S0029'},
  {name: 'VIJAYALAKSHMI', newId: 'U18ER25S0029'},  // Alternative name
  {name: 'VISHAL E M', newId: 'U18ER25S0030'}
];

async function updateStudentIds() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection('students');
  
  console.log('Updating BCA Sem 2 student IDs...\n');
  
  let updated = 0;
  let notFound = [];
  
  for (const update of idUpdates) {
    const result = await col.updateOne(
      { stream: 'BCA', semester: 2, name: update.name },
      { $set: { studentID: update.newId, studentId: update.newId } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ ${update.name} -> ${update.newId}`);
      updated++;
    } else {
      // Check if already has this ID
      const existing = await col.findOne({ stream: 'BCA', semester: 2, name: update.name });
      if (existing && (existing.studentID === update.newId || existing.studentId === update.newId)) {
        console.log(`⏭️ ${update.name} already has ID ${update.newId}`);
      } else if (!existing) {
        notFound.push(update.name);
      }
    }
  }
  
  console.log('\n========== SUMMARY ==========');
  console.log(`Updated: ${updated} students`);
  if (notFound.length > 0) {
    console.log(`Not found: ${notFound.join(', ')}`);
  }
  
  // Show final list
  console.log('\n========== FINAL LIST ==========');
  const students = await col.find({ stream: 'BCA', semester: 2 }).sort({ studentID: 1 }).toArray();
  students.forEach(s => console.log(s.studentID || s.studentId, '-', s.name));
  console.log('Total:', students.length);
  
  await client.close();
}

updateStudentIds().catch(console.error);
