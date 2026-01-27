const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ============================================================================
// SCHEMA
// ============================================================================

const attendanceSchema = new mongoose.Schema({
  stream: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  subject: { type: String, required: true, trim: true },
  subjectCode: { type: String, trim: true },
  subjectType: { type: String, enum: ['CORE', 'LANGUAGE', 'ELECTIVE'], default: 'CORE' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  studentsPresent: { type: [String], required: true },
  totalStudents: { type: Number, required: true, min: 0 },
  presentCount: { type: Number, required: true, min: 0 },
  absentCount: { type: Number, required: true, min: 0 },
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
attendanceSchema.index({ electiveSubject: 1, stream: 1, semester: 1 }, { background: true });
attendanceSchema.index({ subjectType: 1, stream: 1, semester: 1 }, { background: true });
attendanceSchema.index({ teacherEmail: 1, date: -1 }, { background: true });

// Pre-save hook
attendanceSchema.pre('save', function(next) {
  if (!this.presentCount) this.presentCount = this.studentsPresent.length;
  if (!this.absentCount) this.absentCount = this.totalStudents - this.presentCount;
  next();
});

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getSubjectDetails(db, stream, semester, subjectName) {
  try {
    const subjectsCollection = db.collection('subjects');
    const subject = await subjectsCollection.findOne({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
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
  
  if (subjectDetails.isLanguageSubject && subjectDetails.languageType) {
    const targetLang = manualLanguage || subjectDetails.languageType;
    return students.filter(s => 
      (s.languageSubject || '').toUpperCase() === targetLang.toUpperCase()
    );
  }
  
  if (subjectDetails.subjectType === 'ELECTIVE') {
    const targetElective = manualElective || subjectDetails.name;
    return students.filter(s => {
      const studentElec = (s.electiveSubject || '').toUpperCase();
      const subjectName = targetElective.toUpperCase();
      return studentElec === subjectName || studentElec.includes(subjectName);
    });
  }
  
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
// STREAMS ROUTE (Required by view-attendance.js & myclass.js)
// ============================================================================

router.get('/streams', async (req, res) => {
  try {
    console.log('🔥 /api/streams route HIT');
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const cacheKey = 'streams:all';
    let streams = getCache(cacheKey);
    
    if (!streams) {
      const collection = req.db.collection('students');
      streams = await collection.distinct('stream', { isActive: true });
      
      if (streams.length > 0) {
        setCache(cacheKey, streams);
      }
    }
    
    console.log(`✅ Found ${streams.length} streams:`, streams);
    
    res.json({
      success: true,
      streams: streams.sort(),
      count: streams.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SEMESTERS ROUTE (Required by view-attendance.js)
// ============================================================================

router.get('/streams/:stream/semesters', async (req, res) => {
  try {
    const { stream } = req.params;
    
    console.log(`🔍 Fetching semesters for stream: ${stream}`);
    
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
    
    const sortedSemesters = semesters.sort((a, b) => a - b);
    
    console.log(`✅ Found ${sortedSemesters.length} semesters:`, sortedSemesters);
    
    res.json({
      success: true,
      semesters: sortedSemesters,
      count: sortedSemesters.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching semesters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SUBJECTS ROUTE - READS FROM 'subjects' COLLECTION (Fixed!)
// ============================================================================

router.get('/subjects/:stream/sem:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    
    console.log(`🔍 Fetching subjects for ${stream}, Semester ${semester}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const cacheKey = `subjects:${stream}:sem${semester}`;
    let subjects = getCache(cacheKey);
    
    if (!subjects) {
      // ✅ PRIMARY: Query the 'subjects' collection directly
      const subjectsCollection = req.db.collection('subjects');
      
      const subjectDocs = await subjectsCollection.find({
        stream: { $regex: new RegExp(`^${stream}$`, 'i') },
        semester: parseInt(semester),
        isActive: true
      }).sort({ name: 1 }).toArray();
      
      console.log(`📊 Found ${subjectDocs.length} subjects in 'subjects' collection`);
      
      if (subjectDocs.length === 0) {
        // ✅ FALLBACK: Try to get from students collection
        console.log('🔄 Trying fallback: students collection...');
        const studentsCollection = req.db.collection('students');
        
        const students = await studentsCollection.find({
          stream: { $regex: new RegExp(`^${stream}$`, 'i') },
          semester: parseInt(semester),
          isActive: true
        }).limit(10).toArray();
        
        const subjectsSet = new Set();
        
        students.forEach(student => {
          if (student.subjects && Array.isArray(student.subjects)) {
            student.subjects.forEach(subject => {
              if (subject.name || subject.subjectName) {
                subjectsSet.add(subject.name || subject.subjectName);
              }
            });
          }
        });
        
        subjects = Array.from(subjectsSet).sort().map(name => ({ name }));
        console.log(`📊 Found ${subjects.length} subjects from students (fallback)`);
      } else {
        // ✅ Use subjects from 'subjects' collection
        subjects = subjectDocs.map(doc => ({
          name: doc.name,
          subjectCode: doc.subjectCode,
          subjectType: doc.subjectType,
          isLanguageSubject: doc.isLanguageSubject,
          languageType: doc.languageType
        }));
      }
      
      if (subjects.length > 0) {
        setCache(cacheKey, subjects);
      }
    }
    
    console.log(`✅ Returning ${subjects.length} subjects:`, subjects.map(s => s.name));
    
    res.json({
      success: true,
      subjects: subjects,
      count: subjects.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching subjects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ATTENDANCE REGISTER ROUTE (Required by view-attendance.js)
// ============================================================================

router.get('/attendance/register/:stream/sem:semester/:subject', async (req, res) => {
  try {
    const { stream, semester, subject } = req.params;
    const semesterNumber = parseInt(semester);
    
    console.log(`📋 Loading register for ${stream}, Sem ${semesterNumber}, Subject: ${subject}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const sessions = await Attendance.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      subject: { $regex: new RegExp(`^${subject}$`, 'i') }
    }).sort({ date: 1, time: 1 }).lean().exec();
    
    if (sessions.length === 0) {
      return res.json({
        success: true,
        sessions: [],
        students: [],
        totalSessions: 0,
        totalStudents: 0
      });
    }
    
    const studentsCollection = req.db.collection('students');
    const students = await studentsCollection.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      isActive: true
    }).sort({ studentID: 1 }).toArray();
    
    const studentsWithAttendance = students.map(student => {
      let presentCount = 0;
      let absentCount = 0;
      
      const attendance = sessions.map(session => {
        const isPresent = session.studentsPresent.includes(student.studentID);
        if (isPresent) {
          presentCount++;
        } else {
          absentCount++;
        }
        
        return {
          sessionId: session._id,
          status: isPresent ? 'P' : 'A'
        };
      });
      
      const totalSessions = sessions.length;
      const attendancePercentage = totalSessions > 0 
        ? Math.round((presentCount / totalSessions) * 100) 
        : 0;
      
      return {
        studentID: student.studentID,
        name: student.name,
        attendance: attendance,
        presentCount: presentCount,
        absentCount: absentCount,
        attendancePercentage: attendancePercentage
      };
    });
    
    console.log(`✅ Register loaded: ${sessions.length} sessions, ${students.length} students`);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        _id: s._id,
        date: s.date,
        time: s.time
      })),
      students: studentsWithAttendance,
      totalSessions: sessions.length,
      totalStudents: students.length
    });
    
  } catch (error) {
    console.error('❌ Error loading register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SINGLE DATE ATTENDANCE ROUTE (Required by view-attendance.js)
// ============================================================================

router.get('/attendance/date/:stream/sem:semester/:subject/:date', async (req, res) => {
  try {
    const { stream, semester, subject, date } = req.params;
    const semesterNumber = parseInt(semester);
    
    console.log(`📅 Loading attendance for ${stream}, Sem ${semesterNumber}, ${subject} on ${date}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const sessions = await Attendance.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      subject: { $regex: new RegExp(`^${subject}$`, 'i') },
      date: date
    }).sort({ time: 1 }).lean().exec();
    
    if (sessions.length === 0) {
      return res.json({ success: true, sessions: [], students: [] });
    }
    
    const studentsCollection = req.db.collection('students');
    const students = await studentsCollection.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      isActive: true
    }).sort({ studentID: 1 }).toArray();
    
    const studentsWithSessions = students.map(student => ({
      studentID: student.studentID,
      name: student.name,
      sessions: sessions.map(session => ({
        sessionId: session._id,
        time: session.time,
        status: session.studentsPresent.includes(student.studentID) ? 'P' : 'A'
      }))
    }));
    
    console.log(`✅ Found ${sessions.length} sessions for ${date}`);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        _id: s._id,
        time: s.time,
        date: s.date
      })),
      students: studentsWithSessions
    });
    
  } catch (error) {
    console.error('❌ Error loading date attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// UPDATE SESSION ROUTE (Required by view-attendance.js)
// ============================================================================

router.put('/attendance/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { studentsPresent } = req.body;
    
    console.log(`💾 Updating session ${sessionId} with ${studentsPresent.length} present`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const result = await Attendance.findByIdAndUpdate(
      sessionId,
      { 
        studentsPresent: studentsPresent,
        presentCount: studentsPresent.length
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    clearCachePattern(`attendance:${result.stream}`);
    
    console.log(`✅ Session updated successfully`);
    
    res.json({ success: true, modified: 1 });
    
  } catch (error) {
    console.error('❌ Error updating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BULK UPDATE ROUTE (Required by view-attendance.js)
// ============================================================================

router.put('/attendance/bulk/:stream/sem:semester/:subject/:date', async (req, res) => {
  try {
    const { stream, semester, subject, date } = req.params;
    const { updates } = req.body;
    
    console.log(`💾 Bulk updating ${updates.length} sessions for ${date}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const updatePromises = updates.map(update => {
      return Attendance.findByIdAndUpdate(
        update.sessionId,
        { 
          studentsPresent: update.studentsPresent,
          presentCount: update.studentsPresent.length
        }
      );
    });
    
    const results = await Promise.all(updatePromises);
    const totalModified = results.filter(r => r !== null).length;
    
    clearCachePattern(`attendance:${stream}`);
    
    console.log(`✅ Bulk update complete: ${totalModified} document(s) modified`);
    
    res.json({ success: true, modified: totalModified });
    
  } catch (error) {
    console.error('❌ Error bulk updating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DELETE SESSION ROUTE (Required by view-attendance.js)
// ============================================================================

router.delete('/attendance/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🗑️ Deleting session ${sessionId}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const result = await Attendance.findByIdAndDelete(sessionId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    clearCachePattern(`attendance:${result.stream}`);
    
    console.log(`✅ Session deleted successfully`);
    
    res.json({ success: true, deleted: 1 });
    
  } catch (error) {
    console.error('❌ Error deleting session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STUDENTS ROUTES
// ============================================================================

router.get('/students/:stream/sem:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const { language, languageSubject, elective, electiveSubject, subject } = req.query;
    const semesterNumber = parseInt(semester);
    
    console.log(`📥 Fetching students for "${stream}" Sem ${semesterNumber}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const collection = req.db.collection('students');
    
    let students = await collection
      .find({
        stream: { $regex: new RegExp(`^${stream}$`, 'i') },
        semester: semesterNumber,
        isActive: true
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
      .sort({ studentID: 1 })
      .toArray();
    
    let subjectDetails = null;
    if (subject) {
      subjectDetails = await getSubjectDetails(req.db, stream, semester, subject);
    }
    
    const langFilter = language || languageSubject;
    const electFilter = elective || electiveSubject;
    
    const filteredStudents = filterStudentsBySubject(students, subjectDetails, langFilter, electFilter);
    
    console.log(`✅ Students: ${filteredStudents.length} of ${students.length}`);
    
    res.json({
      success: true,
      students: filteredStudents.map(student => ({
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
      totalStudents: students.length,
      stream,
      semester: semesterNumber
    });
    
  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/students/:stream/sem:semester/languages', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNumber = parseInt(semester);
    
    console.log(`🌐 Fetching languages for "${stream}" Sem ${semesterNumber}`);
    
    if (!req.db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    
    const collection = req.db.collection('students');
    
    const languages = await collection.distinct('languageSubject', {
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
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

router.get('/students/:stream/sem:semester/electives', async (req, res) => {
  try {
    const { stream, semester } = req.params;
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
      electiveSubject: { $exists: true, $ne: '', $ne: null }
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
// ATTENDANCE POST ROUTES
// ============================================================================

router.post('/attendance/:stream/sem:semester/:subject', async (req, res) => {
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
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    if (!date || !time || !studentsPresent || totalStudents === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: date, time, studentsPresent, totalStudents' 
      });
    }
    
    const subjectDetails = await getSubjectDetails(req.db, stream, semester, subject);
    
    const attendanceData = {
      stream, 
      semester: semesterNumber, 
      subject, 
      date: date, 
      time,
      studentsPresent, 
      totalStudents,
      presentCount: presentCount || studentsPresent.length,
      absentCount: absentCount || (totalStudents - studentsPresent.length),
      teacherEmail
    };
    
    if (subjectDetails) {
      attendanceData.subjectCode = subjectDetails.subjectCode;
      attendanceData.subjectType = subjectDetails.subjectType;
      
      if (subjectDetails.isLanguageSubject) {
        attendanceData.languageSubject = subjectDetails.languageType;
      }
    }
    
    if (languageSubject && languageSubject !== 'ALL') {
      attendanceData.languageSubject = languageSubject;
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
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    
    const finalStream = classInfo?.stream || stream || 'General';
    const finalSemester = classInfo?.semester || semester || 1;
    
    const subjectDetails = await getSubjectDetails(req.db, finalStream, finalSemester, subject);
    
    const attendanceData = {
      stream: finalStream, 
      semester: finalSemester, 
      subject,
      date: date, 
      time,
      studentsPresent, 
      totalStudents,
      presentCount: presentCount || studentsPresent.length,
      absentCount: absentCount || (totalStudents - studentsPresent.length),
      teacherEmail
    };
    
    if (subjectDetails) {
      attendanceData.subjectCode = subjectDetails.subjectCode;
      attendanceData.subjectType = subjectDetails.subjectType;
      
      if (subjectDetails.isLanguageSubject) {
        attendanceData.languageSubject = subjectDetails.languageType;
      }
    }
    
    if (languageSubject && languageSubject !== 'ALL') {
      attendanceData.languageSubject = languageSubject;
    }
    if (electiveSubject && electiveSubject !== 'ALL') {
      attendanceData.electiveSubject = electiveSubject;
    }
    
    const saved = await new Attendance(attendanceData).save();
    
    clearCachePattern(`attendance:${saved.stream}`);
    
    console.log('✅ Attendance saved:', saved._id);
    res.json({ success: true, attendanceId: saved._id });
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'attendance',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    cache: { size: cache.size, ttl: `${CACHE_TTL / 1000}s` },
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  });
});

module.exports = router;
