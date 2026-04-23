const mongoose = require('mongoose');

const uri = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function checkDb() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  // Check the subjects collection
  const subjectsCol = db.collection('subjects');
  
  const bdaSubjects = await subjectsCol.find({ stream: { $regex: /bda/i }, semester: 2 }).toArray();
  console.log('--- BDA Sem 2 Subjects defined in DB ---');
  bdaSubjects.forEach(s => console.log(s.name, s.subjectCode));

  const allBusinessSubjects = await subjectsCol.find({ name: { $regex: /business/i }, semester: 2 }).toArray();
  console.log('\n--- All streams with Business (sem 2) subjects defined in DB ---');
  allBusinessSubjects.forEach(s => console.log(`Stream: ${s.stream}, Subject: ${s.name}`));
  
  process.exit();
}

checkDb().catch(console.error);
