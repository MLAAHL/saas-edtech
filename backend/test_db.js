require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/student');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance');
  const student = await Student.findOne({ studentID: 'U18ER25C0063' });
  console.log("Found Student: ", student.name);
  console.log("Parent Email: ", student.parentEmail);
  console.log("Parent Phone: ", student.parentPhone);
  process.exit(0);
}
check();
