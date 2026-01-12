const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  id: { type: String, required: true }, // timestamp-based unique ID
  stream: { type: String, required: true },
  semester: { type: Number, required: true, min: 1, max: 6 },
  subject: { type: String, required: true },
  createdAt: { type: String, required: true }, // ISO string
  teacherEmail: { type: String, required: true }
}, { _id: false });

const QueueItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  stream: { type: String, required: true },
  semester: { type: Number, required: true },
  subject: { type: String, required: true },
  addedAt: { type: String, required: true },
  teacherEmail: { type: String }
}, { _id: false });

const CompletedClassSchema = new mongoose.Schema({
  id: { type: String, required: true },
  stream: { type: String, required: true },
  semester: { type: Number, required: true },
  subject: { type: String, required: true },
  completedAt: { type: String, required: true },
  teacherEmail: { type: String }
}, { _id: false });

const TeacherSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String, required: true, unique: true },
  createdSubjects: { type: [SubjectSchema], default: [] },
  attendanceQueue: { type: [QueueItemSchema], default: [] },
  completedClasses: { type: [CompletedClassSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastQueueUpdate: { type: Date }
});

module.exports = mongoose.model('Teacher', TeacherSchema);
