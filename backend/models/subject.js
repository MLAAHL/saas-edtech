const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  subjectName: String,
  stream: String,
  semester: Number,
});

module.exports = mongoose.model("Subject", subjectSchema);
