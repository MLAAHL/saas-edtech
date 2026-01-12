const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  stream: {
    type: String,
    required: true,
    uppercase: true
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  subject: {
    type: String,
    required: true,
    uppercase: true
  },
  studentsPresent: {
    type: [String],
    default: [],
    required: true
  },
  studentsTotal: {
    type: Number,
    required: true,
    min: 0
  },
  // ✅ Add missing fields to match your actual data structure
  totalPossibleStudents: {
    type: Number,
    required: true,
    min: 0
  },
  attendancePercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // ✅ Language subject support
  isLanguageSubject: {
    type: Boolean,
    default: false
  },
  languageType: {
    type: String,
    enum: ['HINDI', 'KANNADA', 'SANSKRIT', null],
    default: null
  },
  languageGroup: {
    type: String,
    default: null
  },
  // ✅ Multiple record support
  recordNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  recordId: {
    type: String,
    unique: true,
    default: function() {
      return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },
  // ✅ Additional tracking fields
  lastRecordNumber: {
    type: Number,
    default: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // This adds createdAt and updatedAt automatically
  collection: 'baseattendances' // Explicit collection name
});

// ✅ IMPORTANT: Create non-unique indexes for performance (allows multiple records)
attendanceSchema.index({ 
  date: 1, 
  stream: 1, 
  semester: 1, 
  subject: 1 
}); // No unique constraint - allows multiple records

// ✅ Additional useful indexes
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ stream: 1, semester: 1 });
attendanceSchema.index({ subject: 1 });
attendanceSchema.index({ createdAt: -1 });

// ✅ Pre-save middleware to calculate attendance percentage
attendanceSchema.pre('save', function(next) {
  // Calculate attendance percentage
  if (this.studentsTotal > 0) {
    this.attendancePercentage = Math.round(
      (this.studentsPresent.length / this.studentsTotal) * 100 * 100
    ) / 100; // Round to 2 decimal places
  } else {
    this.attendancePercentage = 0;
  }
  
  // Ensure totalPossibleStudents is set
  if (!this.totalPossibleStudents) {
    this.totalPossibleStudents = this.studentsTotal;
  }
  
  // Set lastUpdated
  this.lastUpdated = new Date();
  
  next();
});

// ✅ Pre-findOneAndUpdate middleware for updates
attendanceSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  if (update.$set) {
    // Calculate percentage if students data is being updated
    if (update.$set.studentsPresent && update.$set.studentsTotal) {
      const presentCount = Array.isArray(update.$set.studentsPresent) 
        ? update.$set.studentsPresent.length 
        : 0;
      const totalCount = update.$set.studentsTotal || 0;
      
      update.$set.attendancePercentage = totalCount > 0 
        ? Math.round((presentCount / totalCount) * 100 * 100) / 100
        : 0;
    }
    
    update.$set.lastUpdated = new Date();
  }
  
  next();
});

// ✅ Instance methods
attendanceSchema.methods.calculateAttendancePercentage = function() {
  if (this.studentsTotal > 0) {
    return Math.round((this.studentsPresent.length / this.studentsTotal) * 100 * 100) / 100;
  }
  return 0;
};

attendanceSchema.methods.getAbsentStudentsCount = function() {
  return this.studentsTotal - this.studentsPresent.length;
};

attendanceSchema.methods.isValidRecord = function() {
  return (
    this.studentsPresent.length <= this.studentsTotal &&
    this.studentsTotal <= this.totalPossibleStudents &&
    this.attendancePercentage >= 0 &&
    this.attendancePercentage <= 100
  );
};

// ✅ Static methods
attendanceSchema.statics.findByDateAndSubject = function(date, subject, stream, semester) {
  return this.find({
    date: new Date(date),
    subject: subject.toUpperCase(),
    stream: stream.toUpperCase(),
    semester: parseInt(semester)
  }).sort({ createdAt: -1 });
};

attendanceSchema.statics.getAttendanceSummary = function(stream, semester, startDate, endDate) {
  const matchCriteria = {
    stream: stream.toUpperCase(),
    semester: parseInt(semester)
  };
  
  if (startDate && endDate) {
    matchCriteria.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.aggregate([
    { $match: matchCriteria },
    {
      $group: {
        _id: "$subject",
        totalRecords: { $sum: 1 },
        avgAttendancePercentage: { $avg: "$attendancePercentage" },
        totalStudentsPresent: { $sum: { $size: "$studentsPresent" } },
        totalPossibleAttendance: { $sum: "$studentsTotal" },
        lastUpdated: { $max: "$updatedAt" }
      }
    },
    {
      $project: {
        subject: "$_id",
        totalRecords: 1,
        avgAttendancePercentage: { $round: ["$avgAttendancePercentage", 2] },
        totalStudentsPresent: 1,
        totalPossibleAttendance: 1,
        overallPercentage: { 
          $round: [
            { 
              $multiply: [
                { $divide: ["$totalStudentsPresent", "$totalPossibleAttendance"] },
                100
              ]
            },
            2
          ]
        },
        lastUpdated: 1,
        _id: 0
      }
    },
    { $sort: { subject: 1 } }
  ]);
};

// ✅ Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
});

// ✅ Virtual for attendance status
attendanceSchema.virtual('attendanceStatus').get(function() {
  const percentage = this.attendancePercentage;
  if (percentage >= 90) return 'EXCELLENT';
  if (percentage >= 75) return 'GOOD';
  if (percentage >= 60) return 'AVERAGE';
  if (percentage >= 40) return 'LOW';
  return 'VERY_LOW';
});

// ✅ JSON transformation (remove sensitive fields when converting to JSON)
attendanceSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('BaseAttendance', attendanceSchema);
