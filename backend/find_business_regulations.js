const mongoose = require('mongoose');

const uri = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function checkDb() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const col = db.collection('attendance');
  
  // Find streams and semesters that have 'BUSINESS' in their subject
  const businessRecords = await col.aggregate([
    { $match: { subject: { $regex: /business/i } } },
    { $group: { 
        _id: { stream: "$stream", semester: "$semester", subject: "$subject" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.stream": 1, "_id.semester": 1 } }
  ]).toArray();
  
  console.log('Records containing "business" in subject:');
  businessRecords.forEach(r => {
    console.log(`- Stream: ${r._id.stream}, Sem: ${r._id.semester}, Subject: ${r._id.subject} (${r.count} records)`);
  });
  
  // What about "bda sem 2" if it was named something else?
  const subjectsWithReg= await col.distinct('subject', { subject: { $regex: /regula/i }});
  console.log('Subjects containing "regula":', subjectsWithReg);
  
  const bdaRecords = await col.aggregate([
    { $match: { stream: { $regex: /bda/i } } },
    { $group: {
        _id: { semester: "$semester", subject: "$subject" }
      }
    },
    { $sort: { "_id.semester": 1, "_id.subject": 1 } }
  ]).toArray();
  
  console.log('\nAll BDA subjects across all semesters:');
  bdaRecords.forEach(r => {
    console.log(`- Sem: ${r._id.semester}, Subject: ${r._id.subject}`);
  });
  
  process.exit();
}

checkDb().catch(console.error);
