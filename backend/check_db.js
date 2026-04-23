const mongoose = require('mongoose');

const uri = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function checkDb() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  console.log('Collections in Database:');
  collections.forEach(c => console.log('- ' + c.name));
  
  // Let's count documents in each collection
  for (const c of collections) {
    const col = db.collection(c.name);
    const count = await col.countDocuments();
    console.log(`Collection ${c.name} has ${count} documents.`);
    
    // If it's an attendance collection, find BDA distinct subjects
    if (c.name.toLowerCase().includes('attendance')) {
      const distinctStreams = await col.distinct('stream');
      console.log(`  Streams in ${c.name}:`, distinctStreams);
      
      const bdaBusiness = await col.find({
        stream: { $regex: /bda/i },
        semester: 2,
        subject: { $regex: /business/i }
      }).limit(5).toArray();
      
      if (bdaBusiness.length > 0) {
        console.log(`  Found BDA Sem 2 Business Regulations in ${c.name}:`, bdaBusiness.length);
        bdaBusiness.forEach(doc => {
            console.log(`  -> Date: ${doc.date}, Sem: ${doc.semester}, Subject: ${doc.subject}`);
        });
      }
    }
  }
  
  process.exit();
}

checkDb().catch(console.error);
