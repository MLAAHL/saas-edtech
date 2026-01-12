const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  date: Date,
  stream: String,
  semester: Number,
  subject: String,
  studentsPresent: [String],
  studentsTotal: Number
});

module.exports = mongoose.model("BaseAttendance", attendanceSchema);
