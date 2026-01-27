// attendanceRoutes.js - Production-Ready Attendance System with Subject-Based Filtering & WhatsApp Integration
// Current Date and Time: 2025-10-30 18:45:11 UTC
// Current User: Itzzskim

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const router = express.Router();

// Import WhatsApp Service
const whatsappService = require('../services/whatsappService');

// ============================================================================
// SCHEMA
// ============================================================================

const attendanceSchema = new mongoose.Schema({
  stream: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  subject: { type: String, required: true, trim: true },
  subjectCode: { type: String, trim: true },
  subjectType: { type: String, enum: ['CORE', 'LANGUAGE', 'ELECTIVE'], default: 'CORE' },
  date: { type: Date, required:  true },
  time: { type: String, required: true },
  studentsPresent: { type: [String], required: true },
  totalStudents: { type: Number, required: true, min: 0 },
  presentCount: { type: Number, required: true, min: 0 },
  absentCount:  { type: Number, required: true, min: 0 },
  languageSubject: { type: String, trim: true },
  electiveSubject: { type: String, trim: true },
  teacherEmail: { type: String, trim: true }
}, { 
  timestamps: true,
  collection: 'attendance'
});

// Optimized indexes
attendanceSchema.index({ stream: 1, semester: 1, subject: 1, date: -1 }, { background: true });
attendanceSchema.index({ date: -1, stream: 1 }, { background: true });
attendanceSchema.index({ createdAt: -1 }, { background: true });
attendanceSchema.index({ languageSubject: 1, stream: 1, semester: 1 }, { background: true });
attendanceSchema.index({ electiveSubject: 1, stream:  1, semester: 1 }, { background: true });
attendanceSchema.index({ subjectType: 1, stream:  1, semester: 1 }, { background: true });
attendanceSchema.index({ teacherEmail: 1, date: -1 }, { background: true });

// Pre-save hook
attendanceSchema.pre('save', function(next) {
  if (!this.presentCount) this.presentCount = this.studentsPresent.length;
  if (!this.absentCount) this.absentCount = this. totalStudents - this.presentCount;
  next();
});

const Attendance = mongoose.models. Attendance || mongoose.model('Attendance', attendanceSchema);

// ============================================================================
// CACHING SYSTEM
// ============================================================================

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(prefix, params) {
  return `${prefix}:${JSON.stringify(params)}`;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return cached.data;
}

function clearCachePattern(pattern) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) cache.delete(key);
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
  req.db = db;
  next();
});

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60000;

router.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_WINDOW };
  
  if (now > userRequests.resetTime) {
    userRequests.count = 0;
    userRequests.resetTime = now + RATE_WINDOW;
  }
  
  userRequests.count++;
  requestCounts.set(ip, userRequests);
  
  if (userRequests.count > RATE_LIMIT) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded' });
  }
  
  next();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getSubjectDetails(db, stream, semester, subjectName) {
  try {
    const subjectsCollection = db.collection('subjects');
    const subject = await subjectsCollection.findOne({
      stream:  { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: parseInt(semester),
      name: { $regex: new RegExp(`^${subjectName}$`, 'i') },
      isActive: true
    });
    
    return subject;
  } catch (error) {
    console.error('❌ Error fetching subject details:', error);
    return null;
  }
}

function filterStudentsBySubject(students, subjectDetails, manualLanguage = null, manualElective = null) {
  if (!subjectDetails) {
    // No subject details, apply manual filters only
    let filtered = students;
    
    if (manualLanguage && manualLanguage !== 'ALL') {
      filtered = filtered.filter(s => 
        (s.languageSubject || '').toUpperCase() === manualLanguage. toUpperCase()
      );
    }
    
    if (manualElective && manualElective !== 'ALL') {
      filtered = filtered.filter(s => 
        (s.electiveSubject || '').toUpperCase() === manualElective. toUpperCase()
      );
    }
    
    return filtered;
  }
  
  // If it's a language subject
  if (subjectDetails.isLanguageSubject && subjectDetails.languageType) {
    const targetLang = manualLanguage || subjectDetails. languageType;
    return students.filter(s => 
      (s.languageSubject || '').toUpperCase() === targetLang.toUpperCase()
    );
  }
  
  // If it's an elective subject
  if (subjectDetails.subjectType === 'ELECTIVE') {
    const targetElective = manualElective || subjectDetails.name;
    return students.filter(s => {
      const studentElec = (s.electiveSubject || '').toUpperCase();
      const subjectName = targetElective.toUpperCase();
      return studentElec === subjectName || studentElec. includes(subjectName);
    });
  }
  
  // For core subjects, apply manual filters
  let filtered = students;
  
  if (manualLanguage && manualLanguage !== 'ALL') {
    filtered = filtered.filter(s => 
      (s.languageSubject || '').toUpperCase() === manualLanguage.toUpperCase()
    );
  }
  
  if (manualElective && manualElective !== 'ALL') {
    filtered = filtered.filter(s => 
      (s.electiveSubject || '').toUpperCase() === manualElective.toUpperCase()
    );
  }
  
  return filtered;
}

// ============================================================================
// SERVE ABSENCE NOTIFICATION PAGE
// ============================================================================

router. get('/absence-notification-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/absence-notification. html'));
});

// ============================================================================
// STREAMS AND SEMESTERS ROUTES (NEW)
// ============================================================================

// GET - Available streams from database
router.get('/streams', async (req, res) => {
  try {
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const cacheKey = 'streams: all';
    let streams = getCache(cacheKey);
    
    if (!streams) {
      const collection = req.db.collection('students');
      streams = await collection.distinct('stream', { isActive: true });
      
      if (streams.length > 0) {
        setCache(cacheKey, streams);
      }
    }
    
    console.log(`✅ Found ${streams.length} streams`);
    
    res.json({
      success: true,
      streams:  streams. sort(),
      count: streams.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Available semesters for a stream
router.get('/streams/:stream/semesters', async (req, res) => {
  try {
    const { stream } = req.params;
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const cacheKey = `semesters:${stream}`;
    let semesters = getCache(cacheKey);
    
    if (!semesters) {
      const collection = req.db.collection('students');
      semesters = await collection.distinct('semester', {
        stream: { $regex: new RegExp(`^${stream}$`, 'i') },
        isActive: true
      });
      
      if (semesters.length > 0) {
        setCache(cacheKey, semesters);
      }
    }
    
    console.log(`✅ Found ${semesters.length} semesters for ${stream}`);
    
    res.json({
      success: true,
      semesters: semesters.sort((a, b) => a - b),
      count: semesters. length,
      stream
    });
    
  } catch (error) {
    console.error('❌ Error fetching semesters:', error);
    res.status(500).json({ success: false, error: error. message });
  }
});

// ============================================================================
// SUBJECTS ROUTES
// ============================================================================

// GET - Subject details by stream, semester, and name
router.get('/subjects/find', async (req, res) => {
  try {
    const { stream, semester, name } = req.query;
    
    if (!stream || !semester || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters:  stream, semester, name' 
      });
    }
    
    console.log(`📚 Finding subject: ${name} in ${stream} Sem ${semester}`);
    
    const subject = await getSubjectDetails(req.db, stream, semester, name);
    
    if (!subject) {
      return res.status(404).json({ 
        success: false, 
        error: 'Subject not found' 
      });
    }
    
    console.log('✅ Subject found:', subject);
    
    res.json({
      success: true,
      subject: {
        name: subject.name,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        isLanguageSubject: subject.isLanguageSubject,
        languageType: subject.languageType,
        stream: subject.stream,
        semester: subject.semester
      }
    });
    
  } catch (error) {
    console.error('❌ Error finding subject:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STUDENTS ROUTES - Query students collection with Subject-Based Filtering
// ============================================================================

// GET - Students by stream and semester with subject-aware filtering
router.get('/students/: stream/sem: semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const { language, languageSubject, elective, electiveSubject, subject } = req.query;
    const semesterNumber = parseInt(semester);
    
    console.log(`📥 Fetching students for "${stream}" Sem ${semesterNumber}`);
    console.log(`🔍 Params: subject=${subject}, language=${language || languageSubject}, elective=${elective || electiveSubject}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const collection = req.db.collection('students');
    
    // Build base query
    const query = {
      semester: semesterNumber,
      isActive: true
    };
    
    // Try exact match first
    let students = await collection
      .find({ ...query, stream: stream })
      .project({
        _id: 1,
        studentID: 1,
        name: 1,
        email: 1,
        phone: 1,
        parentPhone: 1,
        languageSubject: 1,
        electiveSubject: 1,
        stream: 1,
        semester:  1
      })
      .sort({ studentID: 1 })
      .toArray();
    
    // If no exact match, try case-insensitive
    if (students.length === 0) {
      console.log('🔍 Trying case-insensitive stream match...');
      students = await collection
        .find({ 
          ...query,
          stream: { $regex:  new RegExp(`^${stream}$`, 'i') }
        })
        .project({
          _id: 1,
          studentID: 1,
          name: 1,
          email: 1,
          phone: 1,
          parentPhone: 1,
          languageSubject: 1,
          electiveSubject: 1,
          stream: 1,
          semester: 1
        })
        .sort({ studentID:  1 })
        .toArray();
    }
    
    console.log(`📊 Total students before filtering: ${students.length}`);
    
    // Get subject details if subject parameter provided
    let subjectDetails = null;
    if (subject) {
      subjectDetails = await getSubjectDetails(req.db, stream, semester, subject);
      console.log('📖 Subject details:', subjectDetails);
    }
    
    // Apply filtering
    const langFilter = language || languageSubject;
    const electFilter = elective || electiveSubject;
    
    const filteredStudents = filterStudentsBySubject(students, subjectDetails, langFilter, electFilter);
    
    console.log(`✅ Students after filtering: ${filteredStudents. length}`);
    
    res.json({
      success: true,
      students: filteredStudents. map(student => ({
        studentID: student.studentID || student._id,
        name: student.name || 'Unknown',
        email: student.email,
        phone: student.phone,
        parentPhone: student.parentPhone,
        languageSubject: student.languageSubject,
        electiveSubject: student.electiveSubject,
        stream: student.stream,
        semester: student.semester
      })),
      count: filteredStudents.length,
      totalStudents: students. length,
      stream,
      semester: semesterNumber,
      filters: {
        language: langFilter || null,
        elective: electFilter || null,
        subject: subject || null
      },
      subjectDetails: subjectDetails ?  {
        name: subjectDetails. name,
        type: subjectDetails.subjectType,
        isLanguage: subjectDetails.isLanguageSubject,
        languageType: subjectDetails.languageType
      } : null
    });
    
  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Available languages for a stream/semester
router.get('/students/:stream/sem:semester/languages', async (req, res) => {
  try {
    const { stream, semester } = req. params;
    const semesterNumber = parseInt(semester);
    
    console.log(`🌐 Fetching languages for "${stream}" Sem ${semesterNumber}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const collection = req.db.collection('students');
    
    const languages = await collection. distinct('languageSubject', {
      stream: { $regex:  new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      isActive: true,
      languageSubject: { $exists: true, $ne: '', $ne: null }
    });
    
    console.log(`✅ Found ${languages.length} languages:`, languages);
    
    res.json({
      success: true,
      languages: languages.sort(),
      count: languages.length,
      stream,
      semester: semesterNumber
    });
    
  } catch (error) {
    console.error('❌ Error fetching languages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Available electives for a stream/semester
router.get('/students/: stream/sem:semester/electives', async (req, res) => {
  try {
    const { stream, semester } = req. params;
    const semesterNumber = parseInt(semester);
    
    console.log(`📚 Fetching electives for "${stream}" Sem ${semesterNumber}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const collection = req.db.collection('students');
    
    const electives = await collection.distinct('electiveSubject', {
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      isActive: true,
      electiveSubject:  { $exists: true, $ne: '', $ne: null }
    });
    
    console.log(`✅ Found ${electives.length} electives:`, electives);
    
    res.json({
      success: true,
      electives: electives.sort(),
      count: electives.length,
      stream,
      semester: semesterNumber
    });
    
  } catch (error) {
    console.error('❌ Error fetching electives:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ATTENDANCE ROUTES
// ============================================================================

// POST - Submit attendance with subject metadata
router.post('/attendance/: stream/sem:semester/: subject', async (req, res) => {
  try {
    const { stream, semester, subject } = req.params;
    const { 
      date, 
      time, 
      studentsPresent, 
      totalStudents, 
      presentCount, 
      absentCount,
      languageSubject,
      electiveSubject,
      teacherEmail
    } = req.body;
    const semesterNumber = parseInt(semester. replace('sem', ''));
    
    if (!date || !time || !studentsPresent || totalStudents === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: date, time, studentsPresent, totalStudents' 
      });
    }
    
    // Get subject details
    const subjectDetails = await getSubjectDetails(req.db, stream, semester, subject);
    
    const attendanceData = {
      stream, 
      semester: semesterNumber, 
      subject, 
      date:  new Date(date), 
      time,
      studentsPresent, 
      totalStudents,
      presentCount:  presentCount || studentsPresent. length,
      absentCount:  absentCount || (totalStudents - studentsPresent. length),
      teacherEmail
    };
    
    // Add subject metadata if found
    if (subjectDetails) {
      attendanceData.subjectCode = subjectDetails.subjectCode;
      attendanceData.subjectType = subjectDetails.subjectType;
      
      if (subjectDetails.isLanguageSubject) {
        attendanceData.languageSubject = subjectDetails.languageType;
      }
    }
    
    // Add manual filters if provided
    if (languageSubject && languageSubject !== 'ALL') {
      attendanceData. languageSubject = languageSubject;
    }
    if (electiveSubject && electiveSubject !== 'ALL') {
      attendanceData.electiveSubject = electiveSubject;
    }
    
    const saved = await new Attendance(attendanceData).save();
    
    clearCachePattern(`attendance:${stream}`);
    clearCachePattern(`stats:${stream}`);
    
    console.log('✅ Attendance saved:', saved._id);
    res.json({ success: true, attendanceId: saved._id });
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, error:  error.message });
  }
});

// POST - Simple submit with subject metadata
router.post('/attendance', async (req, res) => {
  try {
    const { 
      date, 
      time, 
      subject, 
      studentsPresent, 
      totalStudents, 
      stream, 
      semester, 
      presentCount, 
      absentCount, 
      classInfo,
      languageSubject,
      electiveSubject,
      teacherEmail
    } = req.body;
    
    if (!date || !time || !subject || !studentsPresent || totalStudents === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: date, time, subject, studentsPresent, totalStudents' 
      });
    }
    
    const finalStream = classInfo?. stream || stream || 'General';
    const finalSemester = classInfo?.semester || semester || 1;
    
    // Get subject details
    const subjectDetails = await getSubjectDetails(req.db, finalStream, finalSemester, subject);
    
    const attendanceData = {
      stream: finalStream, 
      semester: finalSemester, 
      subject,
      date: new Date(date), 
      time,
      studentsPresent, 
      totalStudents,
      presentCount: presentCount || studentsPresent.length,
      absentCount: absentCount || (totalStudents - studentsPresent.length),
      teacherEmail
    };
    
    // Add subject metadata if found
    if (subjectDetails) {
      attendanceData.subjectCode = subjectDetails.subjectCode;
      attendanceData. subjectType = subjectDetails. subjectType;
      
      if (subjectDetails.isLanguageSubject) {
        attendanceData.languageSubject = subjectDetails.languageType;
      }
    }
    
    // Add manual filters if provided
    if (languageSubject && languageSubject !== 'ALL') {
      attendanceData.languageSubject = languageSubject;
    }
    if (electiveSubject && electiveSubject !== 'ALL') {
      attendanceData.electiveSubject = electiveSubject;
    }
    
    const saved = await new Attendance(attendanceData).save();
    
    clearCachePattern(`attendance:${saved. stream}`);
    
    console.log('✅ Attendance saved:', saved._id);
    res.json({ success: true, attendanceId: saved._id });
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - All attendance records with filters
router.get('/attendance', async (req, res) => {
  try {
    const { 
      stream, 
      semester, 
      subject, 
      date, 
      time, 
      startDate, 
      endDate, 
      language,
      languageSubject,
      elective,
      electiveSubject,
      teacherEmail,
      subjectType,
      limit = 50, 
      page = 1 
    } = req.query;
    
    const cacheKey = getCacheKey('attendance', { 
      stream, semester, subject, date, time, language, elective, teacherEmail, subjectType, page, limit 
    });
    let result = getCache(cacheKey);
    
    if (!result) {
      const query = {};
      if (stream) query.stream = stream;
      if (semester) query.semester = parseInt(semester);
      if (subject) query.subject = subject;
      if (date) query.date = new Date(date);
      if (time) query.time = time;
      if (startDate && endDate) query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      if (teacherEmail) query.teacherEmail = teacherEmail;
      if (subjectType) query.subjectType = subjectType;
      
      const langFilter = language || languageSubject;
      if (langFilter && langFilter !== 'ALL') {
        query.languageSubject = langFilter;
      }
      
      const electFilter = elective || electiveSubject;
      if (electFilter && electFilter !== 'ALL') {
        query.electiveSubject = electFilter;
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [records, total] = await Promise.all([
        Attendance. find(query)
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .skip(skip)
          .lean()
          .exec(),
        Attendance.countDocuments(query)
      ]);
      
      result = { 
        success: true, 
        records, 
        count: records.length, 
        total, 
        page: parseInt(page), 
        totalPages: Math.ceil(total / parseInt(limit)),
        filters: {
          language: langFilter || null,
          elective:  electFilter || null,
          subjectType: subjectType || null
        }
      };
      
      setCache(cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching attendance:', error);
    res.status(500).json({ success: false, error: error. message });
  }
});

// GET - Single record
router.get('/attendance/:id', async (req, res) => {
  try {
    const cacheKey = `attendance:single:${req.params.id}`;
    let record = getCache(cacheKey);
    
    if (!record) {
      record = await Attendance.findById(req.params.id).lean();
      if (record) setCache(cacheKey, record);
    }
    
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, record });
  } catch (error) {
    console.error('❌ Error fetching record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Update record
router.put('/attendance/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndUpdate(
      req. params.id, 
      req.body, 
      { new: true, runValidators: true }
    ).lean();
    
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    
    cache.delete(`attendance:single:${req.params.id}`);
    clearCachePattern(`attendance:${record.stream}`);
    
    res.json({ success: true, record });
  } catch (error) {
    console.error('❌ Error updating record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Remove record
router.delete('/attendance/: id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id).lean();
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    
    cache.delete(`attendance:single:${req.params.id}`);
    clearCachePattern(`attendance:${record.stream}`);
    
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Statistics with subject type breakdown
router.get('/attendance/stats/: stream/sem:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const { language, elective, subjectType } = req.query;
    const semesterNumber = parseInt(semester);
    
    const cacheKey = getCacheKey('stats', { stream, semester: semesterNumber, language, elective, subjectType });
    let stats = getCache(cacheKey);
    
    if (!stats) {
      const matchQuery = { stream, semester: semesterNumber };
      
      if (language && language !== 'ALL') {
        matchQuery.languageSubject = language;
      }
      if (elective && elective !== 'ALL') {
        matchQuery.electiveSubject = elective;
      }
      if (subjectType) {
        matchQuery.subjectType = subjectType;
      }
      
      stats = await Attendance.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              subject: '$subject',
              subjectType: '$subjectType',
              language: '$languageSubject',
              elective: '$electiveSubject'
            },
            totalClasses: { $sum: 1 },
            totalPresent: { $sum: '$presentCount' },
            totalAbsent: { $sum: '$absentCount' },
            avgAttendance: { $avg: { $divide: ['$presentCount', '$totalStudents'] } }
          }
        },
        { 
          $project: {
            subject: '$_id.subject',
            subjectType: '$_id.subjectType',
            languageSubject: '$_id. language',
            electiveSubject:  '$_id.elective',
            totalClasses: 1,
            totalPresent:  1,
            totalAbsent: 1,
            avgAttendance: 1,
            _id: 0
          }
        },
        { $sort: { subject: 1 } }
      ]);
      
      setCache(cacheKey, stats);
    }
    
    res.json({ 
      success: true, 
      stats, 
      stream, 
      semester: semesterNumber,
      filters: {
        language: language || null,
        elective: elective || null,
        subjectType: subjectType || null
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// WHATSAPP NOTIFICATION ROUTES
// ============================================================================

// POST - Send absence notifications to parents
router.post('/attendance/: id/notify-absent', async (req, res) => {
  try {
    const { id } = req.params;
    const { customMessage } = req.body;
    
    console.log(`📬 Processing absence notifications for attendance ID: ${id}`);
    
    // Get attendance record
    const attendance = await Attendance.findById(id).lean();
    
    if (!attendance) {
      return res.status(404).json({ 
        success: false, 
        error: 'Attendance record not found' 
      });
    }
    
    // Get all students for this class
    const studentsCollection = req.db.collection('students');
    const allStudents = await studentsCollection
      .find({
        stream: { $regex: new RegExp(`^${attendance.stream}$`, 'i') },
        semester: attendance. semester,
        isActive: true
      })
      .toArray();
    
    console.log(`👥 Total students in class: ${allStudents.length}`);
    console.log(`✅ Present students: ${attendance.studentsPresent.length}`);
    
    // Filter absent students
    const absentStudents = allStudents.filter(student => 
      ! attendance.studentsPresent.includes(student. studentID)
    );
    
    console.log(`❌ Absent students: ${absentStudents.length}`);
    
    if (absentStudents.length === 0) {
      return res.json({
        success: true,
        message: 'No absent students to notify',
        total: 0,
        successful: 0,
        failed:  0
      });
    }
    
    // Apply subject-based filtering if needed
    let filteredAbsentStudents = absentStudents;
    
    if (attendance.languageSubject) {
      filteredAbsentStudents = filteredAbsentStudents.filter(s => 
        (s.languageSubject || '').toUpperCase() === attendance.languageSubject.toUpperCase()
      );
    }
    
    if (attendance.electiveSubject) {
      filteredAbsentStudents = filteredAbsentStudents.filter(s => 
        (s.electiveSubject || '').toUpperCase() === attendance.electiveSubject. toUpperCase()
      );
    }
    
    console. log(`📤 Sending notifications to ${filteredAbsentStudents.length} parents... `);
    
    // Send bulk notifications
    const results = await whatsappService.sendBulkAbsenceNotifications(
      filteredAbsentStudents,
      {
        subject: attendance.subject,
        subjectCode: attendance.subjectCode,
        date: attendance.date,
        stream: attendance.stream,
        semester: attendance.semester,
        time: attendance.time
      }
    );
    
    // Save notification log to database
    const notificationLog = {
      attendanceId: attendance._id,
      stream: attendance.stream,
      semester: attendance.semester,
      subject: attendance.subject,
      date: attendance.date,
      totalAbsent: absentStudents.length,
      notificationsSent: results.successful,
      notificationsFailed: results.failed,
      details: results.details,
      sentBy: req.body.teacherEmail || 'system',
      sentAt: new Date()
    };
    
    await req.db.collection('notification_logs').insertOne(notificationLog);
    
    res.json({
      success: true,
      message: `Notifications sent successfully`,
      ... results,
      logId: notificationLog._id
    });
    
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST - Send test WhatsApp message
router.post('/whatsapp/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error:  'Phone number is required' 
      });
    }
    
    const testMessage = message || 'This is a test message from MLA Academy Attendance System.  Your WhatsApp integration is working correctly!  ✅';
    
    const result = await whatsappService. sendTextMessage(phone, testMessage);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Test message error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST - Send custom message to specific students
router.post('/whatsapp/send-custom', async (req, res) => {
  try {
    const { studentIDs, message, stream, semester } = req.body;
    
    if (!studentIDs || ! Array.isArray(studentIDs) || studentIDs.length === 0) {
      return res. status(400).json({ 
        success: false, 
        error: 'studentIDs array is required' 
      });
    }
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }
    
    // Get students
    const studentsCollection = req.db.collection('students');
    const students = await studentsCollection
      .find({ 
        studentID: { $in: studentIDs },
        isActive: true
      })
      .toArray();
    
    console.log(`📤 Sending custom messages to ${students.length} students... `);
    
    const results = {
      total: students.length,
      successful: 0,
      failed:  0,
      details: []
    };
    
    for (const student of students) {
      if (! student.parentPhone) {
        results.failed++;
        results.details.push({
          studentID: student.studentID,
          name: student.name,
          success: false,
          error: 'No parent phone number'
        });
        continue;
      }
      
      const result = await whatsappService. sendTextMessage(student.parentPhone, message);
      
      if (result.success) {
        results.successful++;
        results.details.push({
          studentID: student.studentID,
          name: student.name,
          phone: result.phone,
          messageId: result.messageId,
          success: true
        });
      } else {
        results. failed++;
        results.details. push({
          studentID: student.studentID,
          name: student.name,
          phone: student.parentPhone,
          success: false,
          error: result.error
        });
      }
      
      await whatsappService.delay(1000);
    }
    
    res.json({
      success: true,
      ... results
    });
    
  } catch (error) {
    console.error('❌ Error sending custom messages:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET - Notification logs
router.get('/notifications/logs', async (req, res) => {
  try {
    const { stream, semester, startDate, endDate, limit = 50, page = 1 } = req.query;
    
    const query = {};
    if (stream) query.stream = stream;
    if (semester) query.semester = parseInt(semester);
    if (startDate && endDate) {
      query.sentAt = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const logs = await req.db.collection('notification_logs')
      .find(query)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .toArray();
    
    const total = await req.db.collection('notification_logs').countDocuments(query);
    
    res.json({
      success: true,
      logs,
      count: logs.length,
      total,
      page: parseInt(page),
      totalPages: Math. ceil(total / parseInt(limit))
    });
    
  } catch (error) {
    console.error('❌ Error fetching notification logs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  const whatsappConfig = whatsappService.checkConfiguration();
  
  res.json({
    status: 'OK',
    service: 'attendance',
    version: '4.0.0',
    features: [
      'subject-based-filtering', 
      'language-filtering', 
      'elective-filtering', 
      'auto-detection',
      'whatsapp-notifications',
      'absence-alerts',
      'dynamic-data-loading'
    ],
    timestamp: new Date().toISOString(),
    user: 'Itzzskim',
    cache: { size: cache.size, ttl: `${CACHE_TTL / 1000}s` },
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    whatsapp: whatsappConfig
  });
});

module.exports = router;