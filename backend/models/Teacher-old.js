const mongoose = require('mongoose');

const createdSubjectSchema = new mongoose.Schema({
    subjectId: {
        type: String,
        required: true
    },
    subjectName: {
        type: String,
        required: true
    },
    subjectCode: {
        type: String,
        required: true
    },
    streamId: {
        type: String,
        required: true
    },
    streamName: {
        type: String,
        required: true
    },
    semesterNumber: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed'],
        default: 'active'
    },
    studentCount: {
        type: Number,
        default: 0
    },
    students: [{
        uucmsRegNo: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        marks: {
            C1: {
                test1: { type: Number, default: null },
                scaledDown: { type: Number, default: null },
                activity: { type: Number, default: null },
                total: { type: Number, default: null }
            },
            C2: {
                test2: { type: Number, default: null },
                scaledDown: { type: Number, default: null },
                activity: { type: Number, default: null },
                total: { type: Number, default: null }
            },
            grandTotal: { type: Number, default: null }
        }
    }],
    iaTests: [{
        name: String,
        date: Date,
        maxMarks: Number,
        status: {
            type: String,
            enum: ['scheduled', 'ongoing', 'completed'],
            default: 'scheduled'
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const teacherSchema = new mongoose.Schema({
    // MongoDB ObjectId (auto-generated)
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true
    },
    
    // Firebase UID (separate field) - optional for localStorage users
    firebaseUid: {
        type: String,
        required: false,
        default: null
    },
    
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false,
        default: ''
    },
    createdSubjects: [createdSubjectSchema],
    
    // Attendance queue management
    attendanceQueue: {
        type: Array,
        default: []
    },
    completedToday: {
        type: Array,
        default: []
    },
    lastQueueUpdate: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Simple validation - no complex constraints
teacherSchema.pre('save', function(next) {
    next();
});

// Static method to find by Firebase UID
teacherSchema.statics.findByFirebaseUid = function(firebaseUid) {
    return this.findOne({ firebaseUid: firebaseUid });
};

// Static method to find by email (for localStorage users)
teacherSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email });
};

// Static method to find by either Firebase UID or email
teacherSchema.statics.findByIdentifier = function(firebaseUid, email) {
    if (firebaseUid) {
        return this.findOne({ firebaseUid: firebaseUid });
    } else if (email) {
        return this.findOne({ email: email });
    }
    return null;
};

module.exports = mongoose.model('Teacher', teacherSchema);