// absenceNotificationRoutes.js - Absence Notification & WhatsApp Integration
// Current Date: 2025-12-19
// User:  Itzzskim

const express = require('express');
const router = express.Router();
const path = require('path');

// Import WhatsApp Service (if you have one)
// const whatsappService = require('../services/whatsappService');

// ============================================================================
// MIDDLEWARE
// ============================================================================

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }
  req.db = db;
  next();
});

// ============================================================================
// SERVE ABSENCE NOTIFICATION PAGE
// ============================================================================

router. get('/absence-notification-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/absence-notification. html'));
});

// ============================================================================
// GET STREAMS
// ============================================================================

router.get('/streams', async (req, res) => {
  try {
    const collection = req.db.collection('students');
    const streams = await collection.distinct('stream', { isActive: true });
    
    console.log(`✅ Found ${streams.length} streams`);
    
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
// GET SEMESTERS FOR A STREAM
// ============================================================================

router.get('/streams/:stream/semesters', async (req, res) => {
  try {
    const { stream } = req.params;
    const collection = req.db. collection('students');
    
    const semesters = await collection.distinct('semester', {
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      isActive: true
    });
    
    console.log(`✅ Found ${semesters.length} semesters for ${stream}`);
    
    res.json({
      success: true,
      semesters:  semesters.sort((a, b) => a - b),
      count: semesters. length,
      stream
    });
  } catch (error) {
    console.error('❌ Error fetching semesters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET STUDENTS BY STREAM AND SEMESTER
// ============================================================================

router.get('/students/:stream/sem: semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNumber = parseInt(semester);
    
    console.log(`📥 Fetching students for "${stream}" Sem ${semesterNumber}`);
    
    const collection = req.db.collection('students');
    
    const query = {
      semester: semesterNumber,
      isActive: true
    };
    
    // Try exact match first
    let students = await collection
      .find({ ... query, stream: stream })
      .project({
        _id: 1,
        studentID: 1,
        name: 1,
        email: 1,
        phone: 1,
        parentPhone: 1,
        stream:  1,
        semester: 1
      })
      .sort({ studentID: 1 })
      .toArray();
    
    // If no exact match, try case-insensitive
    if (students.length === 0) {
      console.log('🔍 Trying case-insensitive stream match.. .');
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
          stream:  1,
          semester: 1
        })
        .sort({ studentID: 1 })
        .toArray();
    }
    
    console.log(`✅ Found ${students.length} students`);
    
    res.json({
      success: true,
      students: students.map(student => ({
        studentID: student.studentID || student._id,
        name: student.name || 'Unknown',
        email: student.email,
        phone: student.phone,
        parentPhone: student.parentPhone,
        stream: student. stream,
        semester: student. semester
      })),
      count: students.length,
      stream,
      semester:  semesterNumber
    });
  } catch (error) {
    console.error('❌ Error fetching students:', error);
    res.status(500).json({ success: false, error: error. message });
  }
});

// ============================================================================
// GET ATTENDANCE RECORDS
// ============================================================================

router.get('/attendance', async (req, res) => {
  try {
    const { stream, semester, date } = req.query;
    
    if (!stream || !semester || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters:  stream, semester, date'
      });
    }
    
    console.log(`📅 Fetching attendance for ${stream} Sem ${semester} on ${date}`);
    
    const mongoose = require('mongoose');
    const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', new mongoose.Schema({}, { strict: false, collection: 'attendance' }));
    
    const query = {
      stream: stream,
      semester: parseInt(semester),
      date: new Date(date)
    };
    
    const records = await Attendance.find(query).lean();
    
    console.log(`✅ Found ${records.length} attendance records`);
    
    res.json({
      success: true,
      records:  records,
      count: records.length
    });
  } catch (error) {
    console.error('❌ Error fetching attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SEND WHATSAPP NOTIFICATIONS (CUSTOM MESSAGE)
// ============================================================================

router.post('/whatsapp/send-custom', async (req, res) => {
  try {
    const { studentIDs, message, stream, semester } = req. body;
    
    if (! studentIDs || !Array.isArray(studentIDs) || studentIDs.length === 0) {
      return res. status(400).json({ 
        success: false, 
        error: 'studentIDs array is required' 
      });
    }
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error:  'Message is required' 
      });
    }
    
    console.log(`📤 Sending custom messages to ${studentIDs.length} students... `);
    
    // Get students from database
    const studentsCollection = req.db.collection('students');
    const students = await studentsCollection
      .find({ 
        studentID: { $in: studentIDs },
        isActive: true
      })
      .toArray();
    
    const results = {
      total: students.length,
      successful: 0,
      failed:  0,
      details: []
    };
    
    // If you have WhatsApp service, use it here
    // Otherwise, simulate the sending
    for (const student of students) {
      if (! student.parentPhone) {
        results.failed++;
        results. details.push({
          studentID: student.studentID,
          name: student. name,
          success: false,
          error: 'No parent phone number'
        });
        continue;
      }
      
      try {
        // Uncomment this if you have whatsappService
        // const result = await whatsappService.sendTextMessage(student.parentPhone, message);
        
        // Simulate success for now
        const result = { success: true, phone: student.parentPhone, messageId: 'simulated_' + Date.now() };
        
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
          results.failed++;
          results.details.push({
            studentID:  student.studentID,
            name: student.name,
            phone: student.parentPhone,
            success: false,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          studentID: student. studentID,
          name: student.name,
          phone: student.parentPhone,
          success: false,
          error: error. message
        });
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Log to database
    try {
      await req.db. collection('notification_logs').insertOne({
        stream,
        semester:  parseInt(semester),
        date: new Date(),
        totalSent: results.successful,
        totalFailed: results.failed,
        details: results.details,
        sentAt: new Date()
      });
    } catch (logError) {
      console.error('❌ Error logging notifications:', logError);
    }
    
    console.log(`✅ Notifications sent:  ${results.successful} successful, ${results.failed} failed`);
    
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

// ============================================================================
// HEALTH CHECK (includes college info)
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'absence-notification',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    whatsapp: {
      configured: ! !(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      collegeName: process.env.COLLEGE_NAME || 'MLA ACADEMY',
      collegePhone: process.env.COLLEGE_PHONE || '+91-1234567890',
      collegeEmail: process. env.COLLEGE_EMAIL || 'office@mlaacademy.edu'
    }
  });
});

// ============================================================================
// EXPORT
// ============================================================================

module.exports = router;