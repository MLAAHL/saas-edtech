// ============================================================================
// STUDENT PROMOTION SYSTEM - FINAL FIXED VERSION
// ============================================================================

const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

// Connection pooling
let cachedDb = null;
let cachedClient = null;

async function getDatabase() {
  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
    });
    
    await client.connect();
    cachedClient = client;
    cachedDb = client.db();
    
    console.log("✅ Promotion DB Connected");
    return cachedDb;
  } catch (error) {
    console.error("❌ Promotion DB Error:", error);
    throw error;
  }
}

// ============================================================================
// 1. GET ALL STREAMS (NO /api/ PREFIX!)
// ============================================================================
router.get('/streams', async (req, res) => {
  console.log('📡 GET /streams');
  try {
    const db = await getDatabase();
    const streams = await db.collection('streams').find({ isActive: true }).toArray();
    
    const formattedStreams = streams.map(stream => ({
      streamCode: stream.streamCode,
      name: stream.name,
      fullName: stream.name,
      semesters: stream.semesters
    }));
    
    console.log(`✅ Returning ${formattedStreams.length} streams`);
    res.json({
      success: true,
      streams: formattedStreams
    });
    
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching streams',
      error: error.message
    });
  }
});

// ============================================================================
// 2. GET PROMOTION PREVIEW (NO /api/ PREFIX!)
// ============================================================================
router.get('/simple-promotion-preview/:stream', async (req, res) => {
  const streamName = req.params.stream;
  console.log(`📡 GET /simple-promotion-preview/${streamName}`);
  
  try {
    const db = await getDatabase();
    
    const streamData = await db.collection('streams').findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      console.log(`❌ Stream not found: ${streamName}`);
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const semesterBreakdown = {};
    let totalStudents = 0;
    
    for (let sem = 1; sem <= 6; sem++) {
      const count = await db.collection('students').countDocuments({ 
        stream: streamData.name,
        semester: sem 
      });
      semesterBreakdown[`semester${sem}`] = count;
      totalStudents += count;
    }
    
    const promotionPreview = [
      `Sem 1 → Sem 2 (${semesterBreakdown.semester1} students)`,
      `Sem 2 → Sem 3 (${semesterBreakdown.semester2} students)`,
      `Sem 3 → Sem 4 (${semesterBreakdown.semester3} students)`,
      `Sem 4 → Sem 5 (${semesterBreakdown.semester4} students)`,
      `Sem 5 → Sem 6 (${semesterBreakdown.semester5} students)`,
      `Sem 6 → Graduate (${semesterBreakdown.semester6} students)`
    ];
    
    console.log(`✅ Preview generated: ${totalStudents} students`);
    
    res.json({
      success: true,
      stream: streamData.name,
      totalStudents: totalStudents,
      semesterBreakdown: semesterBreakdown,
      promotionPreview: promotionPreview
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting promotion preview',
      error: error.message
    });
  }
});

// ============================================================================
// 3. EXECUTE PROMOTION (NO /api/ PREFIX!)
// ============================================================================
router.post('/simple-promotion/:stream', async (req, res) => {
  const streamName = req.params.stream;
  console.log(`📡 POST /simple-promotion/${streamName}`);
  
  try {
    const db = await getDatabase();
    
    const streamData = await db.collection('streams').findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    // CREATE BACKUP
    const allStudents = await db.collection('students')
      .find({ stream: streamData.name })
      .toArray();
    
    await db.collection('promotion_history').insertOne({
      stream: streamData.name,
      timestamp: new Date(),
      students: allStudents,
      totalStudents: allStudents.length,
      restored: false
    });
    
    console.log(`💾 Backup created: ${allStudents.length} students`);
    
    let totalPromoted = 0;
    let totalGraduated = 0;
    const promotionFlow = [];
    
    // Graduate Semester 6
    const deleteResult = await db.collection('students').deleteMany({ 
      stream: streamData.name,
      semester: 6 
    });
    
    if (deleteResult.deletedCount > 0) {
      totalGraduated = deleteResult.deletedCount;
      promotionFlow.push(`✅ Graduated ${deleteResult.deletedCount} students from Semester 6`);
    }
    
    // Promote Semesters 5 → 1
    for (let currentSem = 5; currentSem >= 1; currentSem--) {
      const nextSem = currentSem + 1;
      
      const updateResult = await db.collection('students').updateMany(
        { 
          stream: streamData.name,
          semester: currentSem 
        },
        { 
          $set: { 
            semester: nextSem,
            updatedAt: new Date()
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        totalPromoted += updateResult.modifiedCount;
        promotionFlow.push(`✅ Promoted ${updateResult.modifiedCount} students: Sem ${currentSem} → Sem ${nextSem}`);
      }
    }
    
    console.log(`✅ Promotion complete: ${totalPromoted} promoted, ${totalGraduated} graduated`);
    
    res.json({
      success: true,
      stream: streamData.name,
      totalPromoted: totalPromoted,
      totalGraduated: totalGraduated,
      promotionFlow: promotionFlow,
      backupCreated: true,
      note: 'Semester 1 is now empty. Undo available for 24 hours.'
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing promotion',
      error: error.message
    });
  }
});

// ============================================================================
// 4. CHECK UNDO (NO /api/ PREFIX!)
// ============================================================================
router.get('/can-undo-promotion/:stream', async (req, res) => {
  const streamName = req.params.stream;
  console.log(`📡 GET /can-undo-promotion/${streamName}`);
  
  try {
    const db = await getDatabase();
    
    const streamData = await db.collection('streams').findOne({ 
      $or: [
        { name: new RegExp(`^${streamName}$`, 'i') },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const latestBackupArray = await db.collection('promotion_history')
      .find({ 
        stream: streamData.name,
        restored: { $ne: true }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestBackupArray.length === 0) {
      return res.json({
        success: true,
        canUndo: false,
        message: 'No backup available'
      });
    }
    
    const latestBackup = latestBackupArray[0];
    const hoursOld = Math.floor((Date.now() - new Date(latestBackup.timestamp).getTime()) / (1000 * 60 * 60));
    
    res.json({
      success: true,
      canUndo: hoursOld <= 24,
      backupTimestamp: latestBackup.timestamp,
      hoursOld: hoursOld,
      studentsInBackup: latestBackup.students ? latestBackup.students.length : 0
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// 5. UNDO PROMOTION (NO /api/ PREFIX!)
// ============================================================================
router.post('/undo-promotion/:stream', async (req, res) => {
  const streamName = req.params.stream;
  console.log(`📡 POST /undo-promotion/${streamName}`);
  
  try {
    const db = await getDatabase();
    
    const streamData = await db.collection('streams').findOne({ 
      $or: [
        { name: new RegExp(`^${streamName}$`, 'i') },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const latestBackupArray = await db.collection('promotion_history')
      .find({ stream: streamData.name })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestBackupArray.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No backup found'
      });
    }
    
    const latestBackup = latestBackupArray[0];
    const hoursOld = Math.floor((Date.now() - new Date(latestBackup.timestamp).getTime()) / (1000 * 60 * 60));
    
    if (hoursOld > 24) {
      return res.status(400).json({
        success: false,
        message: `Backup is ${hoursOld} hours old. Undo only available within 24 hours.`
      });
    }
    
    // Restore students
    await db.collection('students').deleteMany({ stream: streamData.name });
    
    if (latestBackup.students && latestBackup.students.length > 0) {
      const studentsToInsert = latestBackup.students.map(student => {
        const { _id, ...studentWithoutId } = student;
        return studentWithoutId;
      });
      
      await db.collection('students').insertMany(studentsToInsert);
    }
    
    await db.collection('promotion_history').updateOne(
      { _id: latestBackup._id },
      { $set: { restored: true, restoredAt: new Date() } }
    );
    
    console.log(`✅ Restored ${latestBackup.students.length} students`);
    
    res.json({
      success: true,
      stream: streamData.name,
      studentsRestored: latestBackup.students ? latestBackup.students.length : 0,
      backupTimestamp: latestBackup.timestamp,
      message: 'Promotion successfully undone'
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// 6. ADD STUDENT (NO /api/ PREFIX!)
// ============================================================================
router.post('/add-student/:stream/sem1', async (req, res) => {
  const streamName = req.params.stream;
  const { studentID, name, parentPhone } = req.body;
  
  console.log(`📡 POST /add-student/${streamName}/sem1`);
  
  try {
    if (!studentID || !name || !parentPhone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    const db = await getDatabase();
    
    const streamData = await db.collection('streams').findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const existing = await db.collection('students').findOne({ studentID: studentID });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Student ${studentID} already exists`
      });
    }
    
    const newStudent = {
      studentID: studentID,
      name: name,
      stream: streamData.name,
      semester: 1,
      parentPhone: parentPhone,
      languageSubject: "",
      electiveSubject: "",
      isActive: true,
      academicYear: new Date().getFullYear(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('students').insertOne(newStudent);
    
    console.log(`✅ Student added: ${studentID}`);
    
    res.json({
      success: true,
      message: `Student added to ${streamData.name} Semester 1`,
      student: newStudent,
      insertedId: result.insertedId
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding student',
      error: error.message
    });
  }
});

module.exports = router;
