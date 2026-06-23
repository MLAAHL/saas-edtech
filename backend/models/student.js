const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentID: { type: String, index: true },
  registerNumber: { type: String, unique: true, sparse: true },
  name: String,
  stream: String,
  semester: Number,
  parentPhone: String,
  parentEmail: String,
  mentorEmail: { type: String, default: null },
  uucmsCredentials: {
    username: { type: String },
    password: { type: String }, // Encrypted
    lastLogin: Date
  },
  syncStatus: {
    lastSynced: Date,
    isSyncing: { type: Boolean, default: false },
    error: String
  },
  isActive: { type: Boolean, default: true },
  parentPassword: { type: String, default: null },
  fcmTokens: [String],
  webPushSubscriptions: { type: [Object], default: [] },
  lastLogin: Date,
  unreadNotificationCount: { type: Number, default: 0 },
  notificationStatus: { type: String, enum: ['granted', 'denied', 'pending', 'not_supported'], default: 'pending' },
  uucmsProfile: {
    university: String,
    college: String,
    course: String,
    fatherName: String,
    motherName: String,
    email: String,
    mobile: String,
    gender: String,
    category: String,
    dateOfBirth: String,
    lastSynced: Date
  }
});

module.exports = mongoose.model("Student", studentSchema);
