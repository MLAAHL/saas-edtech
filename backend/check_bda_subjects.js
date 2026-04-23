const mongoose = require('mongoose');

const uri = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function checkDb() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  
  const db = mongoose.connection.db;
  const col = db.collection('attendance');
  
  const bdaSem2Subjects = await col.distinct('subject', {
    stream: { $regex: /bda/i },
    semester: 2
  });
  console.log('BDA Sem 2 Subjects:', bdaSem2Subjects);
  
  const distinctBDAStreams = await col.distinct('stream', { stream: { $regex: /bda/i } });
  console.log('Distinct BDA streams:', distinctBDAStreams);

  const bdaSem2Records = await col.find({
    stream: { $regex: /bda/i },
    semester: 2
  }).limit(2).toArray();
  console.log('Sample BDA Sem 2 records:', bdaSem2Records.map(r => r.subject));
  
  process.exit();
}

checkDb().catch(console.error);
