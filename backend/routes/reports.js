// routes/reports.js - UPDATED TO MATCH YOUR ATTENDANCE SCHEMA

const express = require('express');
const router = express.Router();

// Middleware to check DB connection
const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({ 
      success: false, 
      message: 'Database connection not available' 
    });
  }
  req.db = db;
  next();
};

router.use(checkDB);

// ============================================================================
// GET AVAILABLE STREAMS FOR DROPDOWN
// ============================================================================

router.get('/available-streams', async (req, res) => {
  try {
    console.log('📚 Fetching available streams from database...');
    
    // Get all active streams from your streams collection
    const streams = await req.db.collection('streams')
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();
    
    if (streams.length === 0) {
      return res.json({
        success: true,
        streams: [],
        message: 'No active streams found'
      });
    }
    
    // Map to the format needed by frontend
    const streamList = streams.map(s => ({
      name: s.name,           // "BCA", "bda", etc.
      streamCode: s.streamCode, // "bca", "bda", etc.
      semesters: s.semesters    // Array (6)
    }));
    
    console.log(`✅ Found ${streamList.length} streams:`, streamList.map(s => s.name).join(', '));
    
    res.json({
      success: true,
      streams: streamList
    });
    
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// GET AVAILABLE SEMESTERS FOR A STREAM
// ============================================================================

router.get('/available-semesters/:stream', async (req, res) => {
  try {
    const { stream } = req.params;
    console.log(`📚 Fetching available semesters for ${stream}...`);
    
    // Method 1: Get from stream document (RECOMMENDED)
    const streamDoc = await req.db.collection('streams')
      .findOne({ 
        $or: [
          { name: stream },
          { streamCode: stream.toLowerCase() }
        ],
        isActive: true 
      });
    
    if (streamDoc && streamDoc.semesters && Array.isArray(streamDoc.semesters)) {
      const semesters = streamDoc.semesters.map(s => parseInt(s)).filter(s => !isNaN(s)).sort((a, b) => a - b);
      console.log(`✅ Found semesters from stream doc: ${semesters.join(', ')}`);
      
      return res.json({
        success: true,
        semesters: semesters
      });
    }
    
    // Method 2: Fallback - Get unique semesters from students collection
    const semesters = await req.db.collection('students')
      .distinct('semester', { 
        stream: stream,
        isActive: true 
      });
    
    const sortedSemesters = semesters
      .map(s => parseInt(s))
      .filter(s => !isNaN(s))
      .sort((a, b) => a - b);
    
    console.log(`✅ Found semesters from students: ${sortedSemesters.join(', ')}`);
    
    res.json({
      success: true,
      semesters: sortedSemesters
    });
    
  } catch (error) {
    console.error('❌ Error fetching semesters:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// STUDENT SUBJECT REPORT - UPDATED FOR YOUR ATTENDANCE SCHEMA
// ============================================================================

router.get('/student-subject-report/:stream/:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNum = parseInt(semester.replace('sem', ''));
    
    console.log(`📊 Generating report for ${stream} Semester ${semesterNum}`);
    
    // 1. Get all students for this stream and semester from DB
    const students = await req.db.collection('students')
      .find({ 
        stream: stream,
        semester: semesterNum,
        isActive: true
      })
      .sort({ studentID: 1, name: 1 })
      .toArray();
    
    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No students found for this stream and semester',
        stream: stream,
        semester: semesterNum,
        totalStudents: 0,
        totalSubjects: 0,
        subjects: [],
        students: [],
        reportDate: new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
    }
    
    console.log(`✅ Found ${students.length} students`);
    
    // 2. Get all subjects for this stream and semester from DB
    const subjects = await req.db.collection('subjects')
      .find({
        stream: stream,
        semester: semesterNum,
        isActive: true
      })
      .sort({ name: 1 })
      .toArray();
    
    console.log(`✅ Found ${subjects.length} subjects`);
    
    if (subjects.length === 0) {
      return res.json({
        success: true,
        message: 'No subjects found for this stream and semester',
        stream: stream,
        semester: semesterNum,
        totalStudents: students.length,
        totalSubjects: 0,
        subjects: [],
        students: [],
        reportDate: new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
    }
    
    const subjectNames = subjects.map(s => s.name);
    
    // 3. Calculate attendance for each student-subject combination
    // YOUR SCHEMA: Each attendance doc represents one class session
    // with studentsPresent array containing student IDs who attended
    
    const studentReports = await Promise.all(students.map(async (student) => {
      const subjectData = {};
      
      for (const subject of subjects) {
        // Get all class sessions (attendance records) for this subject
        const classSessions = await req.db.collection('attendance')
          .find({
            stream: stream,
            semester: semesterNum,
            subject: subject.name
          })
          .toArray();
        
        if (classSessions.length > 0) {
          const totalClasses = classSessions.length;
          
          // Count how many classes this student attended
          const presentCount = classSessions.filter(session => {
            // Check if student's ID is in the studentsPresent array
            return session.studentsPresent && 
                   Array.isArray(session.studentsPresent) &&
                   session.studentsPresent.includes(student.studentID);
          }).length;
          
          const percentage = totalClasses > 0 ? 
            Math.round((presentCount / totalClasses) * 100) : 0;
          
          subjectData[subject.name] = {
            present: presentCount,
            total: totalClasses,
            percentage: percentage
          };
          
          console.log(`  ${student.studentID} - ${subject.name}: ${presentCount}/${totalClasses} = ${percentage}%`);
          
        } else {
          // No class sessions found for this subject
          subjectData[subject.name] = {
            present: 0,
            total: 0,
            percentage: 0
          };
        }
      }
      
      return {
        studentID: student.studentID,
        name: student.name,
        subjects: subjectData
      };
    }));
    
    console.log(`✅ Calculated attendance for ${studentReports.length} students`);
    
    // 4. Return complete report data
    res.json({
      success: true,
      stream: stream,
      semester: semesterNum,
      totalStudents: students.length,
      totalSubjects: subjectNames.length,
      subjects: subjectNames,
      students: studentReports,
      reportDate: new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    });
    
    console.log(`✅ Report generated successfully!`);
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate report'
    });
  }
});

module.exports = router;