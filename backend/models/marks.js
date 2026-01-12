// models/marks.js

const mongoose = require("mongoose");

const markSchema = mongoose.Schema({
  test1: Number,
  activity1: Number,
  test2: Number,
  activity2: Number
});

// studentSchema without reg_no
const studentSchema = mongoose.Schema({
  studentID: { type: String, required: true },
  name: { type: String, required: true },
  subjects: {
    ECD: markSchema,
    ML: markSchema,
    MAD: markSchema,
    "Software Testing": markSchema
  }
});


module.exports = mongoose.model("marks", studentSchema);
