const mongoose = require('mongoose');

const uri = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function verifyAttendanceRecords() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  const attendanceCol = db.collection('attendance');
  const studentsCol = db.collection('students');
  
  // Get all Business Regulations attendance records for Sem 2
  const records = await attendanceCol.find({
    semester: 2,
    subject: { $regex: /BUSINESS REGULATION/i }
  }).toArray();
  
  console.log(`Found ${records.length} attendance records for Business Regulations in Sem 2`);
  
  let bcomCount = 0;
  let bdaCount = 0;
  let mismatchCount = 0;
  let bdaRecordsInWrongStream = [];
  
  for (const record of records) {
    if (!record.studentsPresent || record.studentsPresent.length === 0) continue;
    
    // Check the first present student's stream
    const firstStudentId = record.studentsPresent[0];
    
    const studentInfo = await studentsCol.findOne({
      $or: [ { _id: firstStudentId }, { studentID: firstStudentId } ]
    });
    
    if (studentInfo) {
      if (studentInfo.stream.toUpperCase() !== record.stream.toUpperCase()) {
        mismatchCount++;
        if (studentInfo.stream.toUpperCase() === 'BDA') {
          bdaRecordsInWrongStream.push(record._id);
        }
        console.log(`Mismatch found! Attendance logged as ${record.stream}, but student is ${studentInfo.stream}. Record ID: ${record._id}`);
      } else {
        if (record.stream.toUpperCase().includes('BCOM')) bcomCount++;
      }
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`- Valid BCOM records: ${bcomCount}`);
  console.log(`- Mismatched records (wrong stream logged): ${mismatchCount}`);
  console.log(`- Of those, intended for BDA: ${bdaRecordsInWrongStream.length}`);
  
  if (bdaRecordsInWrongStream.length > 0) {
    console.log('\nFixing the BDA records...');
    const matchIds = bdaRecordsInWrongStream.map(id => id);
    const result = await attendanceCol.updateMany(
      { _id: { $in: matchIds } },
      { $set: { stream: 'BDA' } }
    );
    console.log(`Updated ${result.modifiedCount} records to stream 'BDA'`);
  } else {
    console.log('\nNo missing BDA records were completely misplaced under BCOM. They are likely just deleted or never entered.');
  }
  
  process.exit();
}

verifyAttendanceRecords().catch(console.error);
