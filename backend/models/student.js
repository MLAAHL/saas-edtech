const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentID: String,
  name: String,
  stream: String,
  semester: Number,
  parentPhone: String,
  mentorEmail: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  fcmTokens: [String],
  lastLogin: Date,
  notificationStatus: { type: String, enum: ['granted', 'denied', 'pending', 'not_supported'], default: 'pending' }
});

module.exports = mongoose.model("Student", studentSchema);
