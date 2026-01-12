const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentID: String,
  name: String,
  stream: String,
  semester: Number,
  parentPhone: String,
});

module.exports = mongoose.model("Student", studentSchema);
