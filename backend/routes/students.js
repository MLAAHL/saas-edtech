// routes/students.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const firebaseAuth = require('../middleware/firebaseAuth');
const {
  streamValidation,
  subjectValidation,
  studentValidation,
  validateObjectId,
  bulkDeleteValidation
} = require('../middleware/validation');

const isProduction = process.env.NODE_ENV === 'production';

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
// HEALTH CHECK & DEBUG ROUTES (Disabled in Production)
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Student API is running',
    database: req.db ? 'Connected' : 'Disconnected',
    // Don't expose database name in production
    databaseName: isProduction ? undefined : req.db?.databaseName,
    timestamp: new Date()
  });
});

// Debug routes - DISABLED in production
if (!isProduction) {
  router.get('/debug/info', async (req, res) => {
    try {
      const collections = await req.db.listCollections().toArray();
      res.json({
        success: true,
        databaseName: req.db.databaseName,
        totalCollections: collections.length,
        collections: collections.map(c => c.name)
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/debug/stats', async (req, res) => {
    try {
      const studentsCount = await req.db.collection('students').countDocuments();
      const activeCount = await req.db.collection('students').countDocuments({ isActive: true });

      res.json({
        success: true,
        stats: {
          total: studentsCount,
          active: activeCount,
          inactive: studentsCount - activeCount
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
} else {
  // Return 404 for debug routes in production
  router.get('/debug/*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });
}

// ============================================================================
// ✅ STREAM MANAGEMENT ROUTES
// ============================================================================

router.get('/management/streams', async (req, res) => {
  try {
    console.log('📚 Fetching all streams...');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const streams = await req.db.collection('streams')
      .find({})
      .sort({ name: 1 })
      .toArray();

    console.log(`✅ Found ${streams.length} streams`);

    res.json({ success: true, streams });
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/management/streams', firebaseAuth, streamValidation, async (req, res) => {
  try {
    const { name, streamCode, semesters } = req.body;

    console.log('➕ Adding new stream:', { name, streamCode, semesters });

    if (!name || !streamCode || !semesters) {
      return res.status(400).json({
        success: false,
        message: 'Name, streamCode, and semesters are required'
      });
    }

    const existing = await req.db.collection('streams').findOne({
      $or: [
        { name: name.toUpperCase() },
        { streamCode: streamCode.toLowerCase() }
      ]
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Stream with this name or code already exists'
      });
    }

    const newStream = {
      name: name.toUpperCase(),
      streamCode: streamCode.toLowerCase(),
      semesters: parseInt(semesters),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('streams').insertOne(newStream);

    console.log('✅ Stream added successfully:', result.insertedId);

    res.json({
      success: true,
      message: 'Stream added successfully',
      stream: { ...newStream, _id: result.insertedId }
    });
  } catch (error) {
    console.error('❌ Error adding stream:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/management/streams/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, streamCode, semesters, isActive } = req.body;

    console.log(`🔄 Updating stream ${id}`);

    const updateData = {
      updatedAt: new Date()
    };

    if (name) updateData.name = name.toUpperCase();
    if (streamCode) updateData.streamCode = streamCode.toLowerCase();
    if (semesters) updateData.semesters = parseInt(semesters);
    if (typeof isActive !== 'undefined') updateData.isActive = isActive;

    const result = await req.db.collection('streams').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    console.log('✅ Stream updated');

    res.json({
      success: true,
      message: 'Stream updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating stream:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/management/streams/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Deleting stream ${id}`);

    const result = await req.db.collection('streams').deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stream not found'
      });
    }

    console.log('✅ Stream deleted');

    res.json({
      success: true,
      message: 'Stream deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting stream:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// ✅ SUBJECT MANAGEMENT ROUTES
// ============================================================================

router.get('/management/subjects', async (req, res) => {
  try {
    const { stream, semester } = req.query;

    console.log('📚 Fetching subjects...');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const query = {};
    if (stream) query.stream = stream;
    if (semester) query.semester = parseInt(semester);

    const subjects = await req.db.collection('subjects')
      .find(query)
      .sort({ stream: 1, semester: 1, name: 1 })
      .toArray();

    console.log(`✅ Found ${subjects.length} subjects`);

    res.json({ success: true, subjects });
  } catch (error) {
    console.error('❌ Error fetching subjects:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/management/subjects', firebaseAuth, async (req, res) => {
  try {
    const {
      name,
      subjectCode,
      stream,
      semester,
      subjectType,
      isLanguageSubject,
      languageType
    } = req.body;

    console.log('➕ Adding new subject:', { name, subjectCode, stream, semester });

    if (!name || !subjectCode || !stream || !semester || !subjectType) {
      return res.status(400).json({
        success: false,
        message: 'Name, subjectCode, stream, semester, and subjectType are required'
      });
    }

    const existing = await req.db.collection('subjects').findOne({
      subjectCode: subjectCode.toUpperCase(),
      stream: stream.trim(),
      semester: parseInt(semester)
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Subject with code ${subjectCode} already exists in ${stream} Semester ${semester}`
      });
    }

    const newSubject = {
      name: name.toUpperCase(),
      subjectCode: subjectCode.toUpperCase(),
      stream: stream.trim(),
      semester: parseInt(semester),
      subjectType: subjectType.toUpperCase(),
      isLanguageSubject: isLanguageSubject || false,
      languageType: languageType || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('subjects').insertOne(newSubject);

    console.log('✅ Subject added successfully:', result.insertedId);

    res.json({
      success: true,
      message: 'Subject added successfully',
      subject: { ...newSubject, _id: result.insertedId }
    });
  } catch (error) {
    console.error('❌ Error adding subject:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/management/subjects/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      subjectCode,
      stream,
      semester,
      subjectType,
      isLanguageSubject,
      languageType,
      isActive
    } = req.body;

    console.log(`🔄 Updating subject ${id}`);

    const updateData = {
      updatedAt: new Date()
    };

    if (name) updateData.name = name.toUpperCase();
    if (subjectCode) updateData.subjectCode = subjectCode.toUpperCase();
    if (stream) updateData.stream = stream.trim();
    if (semester) updateData.semester = parseInt(semester);
    if (subjectType) updateData.subjectType = subjectType.toUpperCase();
    if (typeof isLanguageSubject !== 'undefined') updateData.isLanguageSubject = isLanguageSubject;
    if (languageType) updateData.languageType = languageType;
    if (typeof isActive !== 'undefined') updateData.isActive = isActive;

    const result = await req.db.collection('subjects').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    console.log('✅ Subject updated');

    res.json({
      success: true,
      message: 'Subject updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating subject:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// BULK ADD subjects
router.post('/management/subjects/bulk', firebaseAuth, async (req, res) => {
  try {
    const { subjects } = req.body;

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No subjects provided'
      });
    }

    console.log(`📊 Bulk subject upload: ${subjects.length} subjects`);

    const preparedSubjects = subjects.map(s => ({
      name: s.name.toUpperCase(),
      subjectCode: s.subjectCode.toUpperCase(),
      stream: s.stream.trim(),
      semester: parseInt(s.semester),
      subjectType: (s.subjectType || 'CORE').toUpperCase(),
      isLanguageSubject: (s.subjectType || '').toUpperCase() === 'LANGUAGE' || s.isLanguageSubject || false,
      languageType: s.languageType ? s.languageType.toUpperCase() : null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const validSubjects = preparedSubjects.filter(s => s.name && s.subjectCode && s.stream && s.semester);

    if (validSubjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid subjects found'
      });
    }

    // We'll use unordered insert to skip true duplicates (same code + stream + semester)
    const result = await req.db.collection('subjects').insertMany(validSubjects, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        // Find how many were actually inserted
        return { insertedCount: err.result?.nInserted || 0 };
      }
      throw err;
    });

    console.log(`✅ Inserted ${result.insertedCount} subjects`);

    res.json({
      success: true,
      insertedCount: result.insertedCount,
      message: `Successfully uploaded ${result.insertedCount} subjects`
    });

  } catch (error) {
    console.error('❌ Bulk subject upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/management/subjects/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Deleting subject ${id}`);

    const result = await req.db.collection('subjects').deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    console.log('✅ Subject deleted');

    res.json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting subject:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// STREAMS ROUTES
// ============================================================================

router.get('/streams', async (req, res) => {
  try {
    console.log('📚 Fetching all active streams...');

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

    const streamList = streams.map(s => s.name);

    res.json({
      success: true,
      streams: streamList,
      count: streamList.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/streams/:streamCode', async (req, res) => {
  try {
    const { streamCode } = req.params;

    console.log(`🔍 Fetching stream details for: ${streamCode}`);

    const stream = await req.db.collection('streams').findOne({
      $or: [
        { streamCode: { $regex: new RegExp(`^${streamCode}$`, 'i') } },
        { name: { $regex: new RegExp(`^${streamCode}$`, 'i') } }
      ],
      isActive: true
    });

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    console.log(`✅ Found stream: ${stream.name}`);

    res.json({
      success: true,
      stream: {
        streamCode: stream.streamCode || stream.name,
        name: stream.name,
        fullName: stream.fullName || stream.name,
        semesters: stream.semesters || [1, 2, 3, 4, 5, 6]
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stream:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SUBJECTS ROUTES
// ============================================================================

router.get('/subjects/electives', async (req, res) => {
  try {
    console.log('📚 Fetching elective subjects...');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const subjects = await req.db.collection('subjects')
      .find({
        subjectType: 'ELECTIVE',
        isActive: true
      })
      .sort({ name: 1 })
      .toArray();

    console.log(`✅ Found ${subjects.length} elective subjects`);

    res.json({
      success: true,
      subjects: subjects,
      count: subjects.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching electives:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET ALL STUDENTS
// ============================================================================

router.get('/all', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    console.log('📡 Fetching all students from database...');

    const students = await req.db.collection('students')
      .find({})
      .sort({ stream: 1, semester: 1, name: 1 })
      .toArray();

    console.log(`✅ Found ${students.length} students`);

    res.json({
      success: true,
      students: students,
      totalCount: students.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================
// ✅ BULK UPLOAD - ALLOW DUPLICATES, JUST SKIP THEM SILENTLY
router.post('/bulk', async (req, res) => {
  try {
    const students = req.body.students;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No students provided'
      });
    }

    console.log(`📊 Bulk upload: ${students.length} students received`);

    // Step 1: Prepare students
    const preparedStudents = students.map(student => ({
      studentID: student.studentID?.toString().trim() || '',
      name: student.name?.toString().trim() || '',
      stream: student.stream?.toString().trim() || '',
      semester: parseInt(student.semester) || 1,
      parentPhone: student.parentPhone?.toString().trim() || '',
      languageSubject: student.languageSubject?.toString().trim() || '',
      electiveSubject: student.electiveSubject?.toString().trim() || '',
      academicYear: student.academicYear || new Date().getFullYear(),
      isActive: student.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Step 2: Filter valid students (must have ID and name)
    const validStudents = preparedStudents.filter(s => s.studentID && s.name);

    if (validStudents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid students found (missing ID or name)'
      });
    }

    // Step 3: Deduplicate within Excel file itself
    const seenIDs = new Set();
    const uniqueStudentsFromExcel = [];
    const duplicatesInExcel = [];

    for (const student of validStudents) {
      if (seenIDs.has(student.studentID)) {
        duplicatesInExcel.push(student.studentID);
      } else {
        seenIDs.add(student.studentID);
        uniqueStudentsFromExcel.push(student);
      }
    }

    console.log(`✅ Unique students in Excel: ${uniqueStudentsFromExcel.length}`);
    if (duplicatesInExcel.length > 0) {
      console.log(`⚠️ Duplicate rows in Excel (skipped): ${duplicatesInExcel.length}`);
    }

    // Step 4: Check which students already exist in database
    const existingStudentIDs = await req.db.collection('students')
      .find({
        studentID: { $in: uniqueStudentsFromExcel.map(s => s.studentID) }
      })
      .project({ studentID: 1 })
      .toArray();

    const existingIDs = new Set(existingStudentIDs.map(s => s.studentID));
    const newStudents = uniqueStudentsFromExcel.filter(s => !existingIDs.has(s.studentID));
    const alreadyInDB = uniqueStudentsFromExcel.filter(s => existingIDs.has(s.studentID));

    console.log(`✅ New students to insert: ${newStudents.length}`);
    if (alreadyInDB.length > 0) {
      console.log(`ℹ️ Already in database (skipped): ${alreadyInDB.length}`);
    }

    // Step 5: Insert only new students (if any)
    let insertedCount = 0;
    if (newStudents.length > 0) {
      const result = await req.db.collection('students').insertMany(newStudents);
      insertedCount = result.insertedCount;
      console.log(`✅ Successfully inserted ${insertedCount} students`);
    }

    // Step 6: Build success message
    const totalProcessed = students.length;
    const totalSkipped = alreadyInDB.length + duplicatesInExcel.length;

    let message = `✅ Processed ${totalProcessed} students\n`;
    message += `✅ Added ${insertedCount} new students`;

    if (totalSkipped > 0) {
      message += `\nℹ️ ${totalSkipped} already exist (skipped)`;
    }

    // Always return success
    res.json({
      success: true,
      insertedCount: insertedCount,
      skippedCount: totalSkipped,
      totalProcessed: totalProcessed,
      message: message,
      details: {
        newStudents: insertedCount,
        alreadyInDatabase: alreadyInDB.length,
        duplicateRowsInExcel: duplicatesInExcel.length
      }
    });

  } catch (error) {
    console.error('❌ Bulk upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ BULK DELETE - DELETE ALL STUDENTS BY STREAM/SEMESTER (PROTECTED)
router.post('/bulk/delete', firebaseAuth, bulkDeleteValidation, async (req, res) => {
  try {
    const { stream, semester, studentIds } = req.body;

    console.log('🗑️ Bulk delete request:', { stream, semester, studentIds });

    let query = {};

    // Option 1: Delete by studentIds array
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      const objectIds = studentIds
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      query = { _id: { $in: objectIds } };
    }
    // Option 2: Delete by stream and/or semester
    else {
      if (stream) query.stream = stream;
      if (semester) query.semester = parseInt(semester);

      if (Object.keys(query).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Please provide studentIds or stream/semester filter'
        });
      }
    }

    const result = await req.db.collection('students').deleteMany(query);

    console.log(`✅ Bulk deleted ${result.deletedCount} students`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} students`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error bulk deleting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ BULK UPDATE STATUS (PROTECTED)
router.post('/bulk/update-status', firebaseAuth, async (req, res) => {
  try {
    const { studentIds, isActive } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'studentIds array is required'
      });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean'
      });
    }

    const objectIds = studentIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const result = await req.db.collection('students').updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          isActive: isActive,
          updatedAt: new Date()
        }
      }
    );

    console.log(`✅ Bulk updated ${result.modifiedCount} students`);

    res.json({
      success: true,
      message: `${result.modifiedCount} students updated`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error bulk updating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ADD NEW STUDENT (PROTECTED)
// ============================================================================

router.post('/', firebaseAuth, async (req, res) => {
  try {
    console.log('🔵 POST /api/students - Add New Student');

    const studentData = req.body;

    if (!studentData.studentID) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required'
      });
    }

    if (!studentData.name) {
      return res.status(400).json({
        success: false,
        error: 'Student name is required'
      });
    }

    if (!studentData.stream) {
      return res.status(400).json({
        success: false,
        error: 'Stream is required'
      });
    }

    if (!studentData.semester) {
      return res.status(400).json({
        success: false,
        error: 'Semester is required'
      });
    }

    const existing = await req.db.collection('students').findOne({
      studentID: studentData.studentID
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Student ID already exists'
      });
    }

    const newStudent = {
      studentID: studentData.studentID.trim(),
      name: studentData.name.trim(),
      stream: studentData.stream,
      semester: parseInt(studentData.semester),
      parentPhone: studentData.parentPhone?.trim() || '',
      languageSubject: studentData.languageSubject || '',
      electiveSubject: studentData.electiveSubject?.trim() || '',
      academicYear: studentData.academicYear || new Date().getFullYear(),
      isActive: studentData.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('students').insertOne(newStudent);

    console.log('✅ Student added successfully! ID:', result.insertedId);

    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      studentId: result.insertedId
    });

  } catch (error) {
    console.error('❌ Error adding student:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET STUDENTS WITH FILTERS
// ============================================================================

router.get('/', async (req, res) => {
  try {
    const { stream, semester, language, elective, status } = req.query;

    const query = {};
    if (stream) query.stream = stream;
    if (semester) query.semester = parseInt(semester);
    if (language) query.languageSubject = language;
    if (elective) query.electiveSubject = elective;
    if (status !== undefined) query.isActive = status === 'true';

    const students = await req.db.collection('students')
      .find(query)
      .sort({ stream: 1, semester: 1, name: 1 })
      .toArray();

    res.json({ success: true, students, count: students.length });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET SINGLE STUDENT BY ID
// ============================================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    let student;
    if (ObjectId.isValid(id)) {
      student = await req.db.collection('students').findOne({
        _id: new ObjectId(id)
      });
    }

    if (!student) {
      student = await req.db.collection('students').findOne({
        studentID: id
      });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    res.json({ success: true, student });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// UPDATE STUDENT (PROTECTED)
// ============================================================================

router.put('/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log(`🔄 Updating student ${id}`);

    delete updateData._id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    if (updateData.semester) {
      updateData.semester = parseInt(updateData.semester);
    }

    let result;
    if (ObjectId.isValid(id)) {
      result = await req.db.collection('students').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    }

    if (!result || result.matchedCount === 0) {
      result = await req.db.collection('students').updateOne(
        { studentID: id },
        { $set: updateData }
      );
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    console.log(`✅ Student updated`);

    res.json({
      success: true,
      message: 'Student updated successfully',
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error updating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DELETE STUDENT (PROTECTED)
// ============================================================================

router.delete('/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting student: ${id}`);

    let result;
    if (ObjectId.isValid(id)) {
      result = await req.db.collection('students').deleteOne({
        _id: new ObjectId(id)
      });
    }

    if (!result || result.deletedCount === 0) {
      result = await req.db.collection('students').deleteOne({
        studentID: id
      });
    }

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    console.log(`✅ Student deleted`);

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
