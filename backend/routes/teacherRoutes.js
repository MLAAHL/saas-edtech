// ============================================================================
// ROUTES/TEACHER. JS - COMPLETE WITH SCHEMA + CLOUDINARY SUPPORT
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const firebaseAuth = require('../middleware/firebaseAuth');

// ============================================================================
// TEACHER SCHEMA (DEFINED IN ROUTE FILE)
// ============================================================================

const teacherSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  profileImageUrl: {
    type: String,
    default: '',
    trim: true
  },
  createdSubjects: {
    type: [Object],
    default: []
  },
  attendanceQueue: {
    type: [Object],
    default: []
  },
  completedClasses: {
    type: [Object],
    default: []
  },
  lastQueueUpdate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

teacherSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema);

// ============================================================================
// MIDDLEWARE
// ============================================================================

const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not available'
    });
  }
  req.db = db;
  next();
};

router.use(checkDB);

// ============================================================================
// UTIL VALIDATORS
// ============================================================================

const validateSubject = (subject) => {
  if (!subject || typeof subject !== 'object') throw new Error('Invalid subject object');
  const required = ['id', 'stream', 'semester', 'subject', 'createdAt', 'teacherEmail'];
  const missing = required.filter(f => !subject[f]);
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
  if (typeof subject.semester !== 'number' || subject.semester < 1 || subject.semester > 6)
    throw new Error('Semester must be between 1 and 6');
};

const validateQueueItem = (item) => {
  if (!item || typeof item !== 'object') throw new Error('Invalid queue item object');
  const required = ['id', 'stream', 'semester', 'subject', 'addedAt'];
  const missing = required.filter(f => !item[f]);
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
};

const validateCompletedClass = (completed) => {
  if (!completed || typeof completed !== 'object') throw new Error('Invalid completed class object');
  const required = ['id', 'stream', 'semester', 'subject', 'completedAt'];
  const missing = required.filter(f => !completed[f]);
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
};

// ============================================================================
// ✅ CLOUDINARY URL VALIDATOR
// ============================================================================

const isValidImageUrl = (url) => {
  if (!url || typeof url !== 'string') return false;

  // Check for valid HTTP/HTTPS URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // Allow Cloudinary URLs
  if (url.includes('cloudinary.com')) {
    return true;
  }

  // Allow Firebase Storage URLs (for backward compatibility)
  if (url.includes('firebasestorage.googleapis.com')) {
    return true;
  }

  // Allow other common image hosting services
  const allowedDomains = [
    'cloudinary.com',
    'res.cloudinary.com',
    'firebasestorage. googleapis.com',
    'storage.googleapis.com',
    'imgur.com',
    'i.imgur.com',
    'images.unsplash. com',
    'cdn.jsdelivr.net'
  ];

  try {
    const urlObj = new URL(url);
    return allowedDomains.some(domain => urlObj.hostname.includes(domain)) ||
      url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i);
  } catch {
    return false;
  }
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Teacher API is running',
    database: req.db ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString(),
    imageStorage: 'Cloudinary'
  });
});

// ============================================================================
// GET ALL STREAMS
// ============================================================================

router.get('/streams', async (req, res) => {
  try {
    console.log('📚 [GET /api/teacher/streams] Fetching all streams.. .');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const streams = await req.db.collection('streams')
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();

    console.log(`✅ Found ${streams.length} active streams`);

    const formattedStreams = streams.map(stream => ({
      name: stream.name,
      streamCode: stream.streamCode,
      semesters: stream.semesters || []
    }));

    res.json({
      success: true,
      streams: formattedStreams,
      count: formattedStreams.length
    });

  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// LOAD SUBJECTS FROM DATABASE
// ============================================================================

router.get('/streams/:streamName/sem:semester/subjects', async (req, res) => {
  try {
    const { streamName, semester } = req.params;

    console.log(`📚 Loading subjects for "${streamName}" Sem ${semester}`);

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    if (!streamName || !semester) {
      return res.status(400).json({
        success: false,
        error: 'Stream name and semester are required'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 6) {
      return res.status(400).json({
        success: false,
        error: 'Invalid semester.  Must be between 1 and 6'
      });
    }

    const decodedStreamName = decodeURIComponent(streamName);

    let subjects = await req.db.collection('subjects')
      .find({
        stream: decodedStreamName,
        semester: semesterNum,
        isActive: true
      })
      .sort({ name: 1 })
      .toArray();

    if (subjects.length === 0) {
      subjects = await req.db.collection('subjects')
        .find({
          stream: { $regex: new RegExp(`^${decodedStreamName}$`, 'i') },
          semester: semesterNum,
          isActive: true
        })
        .sort({ name: 1 })
        .toArray();
    }

    console.log(`✅ Found ${subjects.length} subjects`);

    const formattedSubjects = subjects.map(subject => ({
      name: subject.name || subject.subjectName,
      subjectCode: subject.subjectCode,
      subjectType: subject.subjectType,
      isLanguageSubject: subject.isLanguageSubject,
      languageType: subject.languageType
    }));

    res.json({
      success: true,
      subjects: formattedSubjects,
      count: formattedSubjects.length,
      query: {
        stream: decodedStreamName,
        semester: semesterNum
      }
    });

  } catch (error) {
    console.error('❌ Error loading subjects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ALTERNATIVE ENDPOINT: Query subjects with query params
// ============================================================================

router.get('/subjects/available', async (req, res) => {
  try {
    const { stream, semester } = req.query;

    if (!stream || !semester) {
      return res.status(400).json({
        success: false,
        error: 'Stream and semester query params are required'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 6) {
      return res.status(400).json({
        success: false,
        error: 'Invalid semester. Must be between 1 and 6'
      });
    }

    const decodedStreamName = decodeURIComponent(stream);

    let subjects = await req.db.collection('subjects')
      .find({
        stream: decodedStreamName,
        semester: semesterNum,
        isActive: true
      })
      .sort({ name: 1 })
      .toArray();

    if (subjects.length === 0) {
      subjects = await req.db.collection('subjects')
        .find({
          stream: { $regex: new RegExp(`^${decodedStreamName}$`, 'i') },
          semester: semesterNum,
          isActive: true
        })
        .sort({ name: 1 })
        .toArray();
    }

    const formattedSubjects = subjects.map(subject => ({
      name: subject.name || subject.subjectName,
      subjectCode: subject.subjectCode,
      subjectType: subject.subjectType,
      isLanguageSubject: subject.isLanguageSubject,
      languageType: subject.languageType
    }));

    res.json({
      success: true,
      subjects: formattedSubjects,
      count: formattedSubjects.length
    });

  } catch (error) {
    console.error('❌ Error loading available subjects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PROFILE ROUTES
// ============================================================================

router.post('/profile', firebaseAuth, async (req, res) => {
  const { name, profileImageUrl } = req.body;
  const { uid, email } = req.firebaseUser;

  console.log('📥 Profile request:', { name, email, uid, hasImage: !!profileImageUrl });

  if (!uid || !email) {
    return res.status(400).json({
      success: false,
      error: 'Missing Firebase UID or email'
    });
  }

  // Use provided name or fallback to email prefix if creating new
  const finalName = (name && name.trim() !== '') ? name.trim() : email.split('@')[0];

  // Validate image URL if provided
  if (profileImageUrl && !isValidImageUrl(profileImageUrl)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid profile image URL format'
    });
  }

  try {
    let teacher = await Teacher.findOne({ firebaseUid: uid });

    if (!teacher) {
      teacher = await Teacher.create({
        firebaseUid: uid,
        name: finalName,
        email,
        profileImageUrl: profileImageUrl || ''
      });
      console.log('✅ NEW profile created:', email);
    } else {
      // ONLY update the name if the teacher doesn't have one yet
      if (!teacher.name || teacher.name.trim() === '') {
        if (name && name.trim() !== '') {
          teacher.name = name.trim();
        } else {
          teacher.name = finalName;
        }
      }

      if (profileImageUrl !== undefined) {
        teacher.profileImageUrl = profileImageUrl;
      }
      teacher.updatedAt = new Date();
      await teacher.save();
      console.log('✅ Profile updated:', email);
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error with profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/profile/:firebaseUid', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ firebaseUid: req.params.firebaseUid });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/profile/email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const teacher = await Teacher.findOne({ email: email.toLowerCase().trim() });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ✅ UPDATE NAME ROUTE
// ============================================================================

router.patch('/profile/:email/name', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const { name, firebaseUid } = req.body;

    console.log('✏️ ===== NAME UPDATE =====');
    console.log('   Email:', email);
    console.log('   New Name:', name);

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Valid name is required'
      });
    }

    // 1. Try finding by email (case-insensitive)
    let teacher = await Teacher.findOne({
      email: email.toLowerCase().trim()
    });

    // 2. Fallback: try finding by firebaseUid if provided
    if (!teacher && firebaseUid) {
      console.log('🔄 Email lookup failed, trying firebaseUid lookup:', firebaseUid);
      teacher = await Teacher.findOne({ firebaseUid });
    }

    if (!teacher && firebaseUid) {
      console.log(`👤 Profile missing during name update, auto-creating for: ${email}`);
      teacher = await Teacher.create({
        firebaseUid,
        name: name.trim(),
        email: email.toLowerCase().trim()
      });
    } else if (!teacher) {
      console.log('❌ Teacher not found by email or uid:', { email, firebaseUid });
      return res.status(404).json({
        success: false,
        error: 'Teacher profile not found. Please log out and log in again.'
      });
    } else {
      // 3. Update existing record
      teacher.name = name.trim();
      // Ensure email/uid are in sync if they were missing or different
      if (!teacher.email) teacher.email = email.toLowerCase().trim();
      if (!teacher.firebaseUid && firebaseUid) teacher.firebaseUid = firebaseUid;

      teacher.updatedAt = new Date();
      await teacher.save();
    }

    console.log('✅ Name updated successfully');
    console.log('   New Name:', teacher.name);

    res.json({
      success: true,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        profileImageUrl: teacher.profileImageUrl
      },
      message: 'Name updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating name:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ✅ UPDATE PROFILE IMAGE URL (CLOUDINARY SUPPORT)
// ============================================================================

router.patch('/profile/:email/image', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const { profileImageUrl } = req.body;

    console.log('🖼️ ===== PROFILE IMAGE UPDATE (CLOUDINARY) =====');
    console.log('   Email:', email);
    console.log('   URL:', profileImageUrl);

    // Validate URL is provided
    if (!profileImageUrl || typeof profileImageUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid profile image URL is required'
      });
    }

    const trimmedUrl = profileImageUrl.trim();

    // Validate URL format
    if (!isValidImageUrl(trimmedUrl)) {
      console.log('❌ Invalid image URL format:', trimmedUrl);
      return res.status(400).json({
        success: false,
        error: 'Invalid profile image URL.  Must be a valid Cloudinary or image hosting URL'
      });
    }

    // Check if it's a Cloudinary URL
    const isCloudinaryUrl = trimmedUrl.includes('cloudinary. com');
    console.log('   Is Cloudinary URL:', isCloudinaryUrl);

    const teacher = await Teacher.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          profileImageUrl: trimmedUrl,
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!teacher) {
      console.log('❌ Teacher not found:', email);
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    console.log('✅ Profile image updated successfully');
    console.log('   New URL:', teacher.profileImageUrl);
    console.log('   Storage:', isCloudinaryUrl ? 'Cloudinary' : 'Other');

    res.json({
      success: true,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        profileImageUrl: teacher.profileImageUrl
      },
      message: 'Profile image updated successfully',
      storage: isCloudinaryUrl ? 'cloudinary' : 'external'
    });

  } catch (error) {
    console.error('❌ Error updating profile image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ✅ DELETE PROFILE IMAGE
// ============================================================================

router.delete('/profile/:email/image', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);

    console.log('🗑️ ===== DELETE PROFILE IMAGE =====');
    console.log('   Email:', email);

    const teacher = await Teacher.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          profileImageUrl: '',
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!teacher) {
      console.log('❌ Teacher not found:', email);
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    console.log('✅ Profile image removed successfully');

    res.json({
      success: true,
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        profileImageUrl: teacher.profileImageUrl
      },
      message: 'Profile image removed successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting profile image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/profile/delete/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const result = await Teacher.deleteOne({ email: email.toLowerCase().trim() });

    console.log('🗑️ Deleted profile:', email);

    res.json({
      success: true,
      message: 'Profile deleted',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SUBJECT ROUTES
// ============================================================================

router.get('/subjects', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOne({ email: email.toLowerCase().trim() });

    if (!teacher) {
      return res.json({ success: true, subjects: [] });
    }

    res.json({
      success: true,
      subjects: teacher.createdSubjects || []
    });
  } catch (error) {
    console.error('❌ Error fetching subjects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/subjects', async (req, res) => {
  try {
    const { teacherEmail, subject, firebaseUid, name } = req.body;

    if (!teacherEmail || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email and subject data are required'
      });
    }

    validateSubject(subject);

    let teacher = await Teacher.findOne({ email: teacherEmail.toLowerCase().trim() });

    if (!teacher && firebaseUid) {
      console.log(`👤 Creating missing teacher profile for: ${teacherEmail}`);
      teacher = await Teacher.create({
        firebaseUid,
        name: name || teacherEmail.split('@')[0],
        email: teacherEmail.toLowerCase().trim()
      });
    }

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher profile not found. Please log in again.'
      });
    }

    const exists = teacher.createdSubjects.some(
      s => s.stream === subject.stream &&
        s.semester === subject.semester &&
        s.subject === subject.subject
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        error: 'Subject already exists'
      });
    }

    teacher.createdSubjects.push(subject);
    teacher.updatedAt = new Date();
    await teacher.save();

    console.log('✅ Subject added for teacher:', teacherEmail);

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error adding subject:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/subjects/:subjectId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { subjectId } = req.params;

    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOneAndUpdate(
      { email: teacherEmail.toLowerCase().trim() },
      {
        $pull: { createdSubjects: { id: subjectId } },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    console.log('✅ Subject deleted');

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error deleting subject:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// QUEUE ROUTES
// ============================================================================

router.post('/queue', async (req, res) => {
  try {
    const { teacherEmail, queueData } = req.body;

    if (!teacherEmail || !Array.isArray(queueData)) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email and queue data array are required'
      });
    }

    queueData.forEach(validateQueueItem);

    const teacher = await Teacher.findOneAndUpdate(
      { email: teacherEmail.toLowerCase().trim() },
      {
        $set: {
          attendanceQueue: queueData,
          lastQueueUpdate: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error updating queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOne({ email: email.toLowerCase().trim() });

    res.json({
      success: true,
      queueData: teacher?.attendanceQueue || []
    });
  } catch (error) {
    console.error('❌ Error fetching queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/queue/:itemId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { itemId } = req.params;

    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOneAndUpdate(
      { email: teacherEmail.toLowerCase().trim() },
      {
        $pull: { attendanceQueue: { id: itemId } },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error deleting queue item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// COMPLETED CLASSES
// ============================================================================

router.post('/completed', async (req, res) => {
  try {
    const { teacherEmail, completedClass } = req.body;

    if (!teacherEmail || !completedClass) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email and completed class data are required'
      });
    }

    validateCompletedClass(completedClass);

    const teacher = await Teacher.findOneAndUpdate(
      { email: teacherEmail.toLowerCase().trim() },
      {
        $push: { completedClasses: completedClass },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error adding completed class:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/completed', async (req, res) => {
  try {
    const { email, limit } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOne({ email: email.toLowerCase().trim() });

    if (!teacher) {
      return res.json({ success: true, completedClasses: [] });
    }

    let completed = teacher.completedClasses.sort(
      (a, b) => new Date(b.completedAt) - new Date(a.completedAt)
    );

    if (limit) {
      completed = completed.slice(0, parseInt(limit));
    }

    res.json({ success: true, completedClasses: completed });
  } catch (error) {
    console.error('❌ Error fetching completed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/completed/:completedId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { completedId } = req.params;

    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }

    const teacher = await Teacher.findOneAndUpdate(
      { email: teacherEmail.toLowerCase().trim() },
      {
        $pull: { completedClasses: { id: completedId } },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('❌ Error deleting completed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STATS
// ============================================================================

router.get('/stats/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const teacher = await Teacher.findOne({ email: email.toLowerCase().trim() });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    // Check if profile image is from Cloudinary
    const isCloudinaryImage = teacher.profileImageUrl &&
      teacher.profileImageUrl.includes('cloudinary.com');

    const stats = {
      totalSubjects: teacher.createdSubjects.length,
      queueLength: teacher.attendanceQueue.length,
      completedClasses: teacher.completedClasses.length,
      lastActive: teacher.updatedAt,
      hasProfileImage: !!teacher.profileImageUrl,
      imageStorage: isCloudinaryImage ? 'cloudinary' : (teacher.profileImageUrl ? 'external' : 'none')
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;