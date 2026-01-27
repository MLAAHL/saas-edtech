// routes/ai-assistant.js - COMPLETE VERSION
const express = require('express');
const router = express.Router();

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
// ROUTES
// ============================================================================
router.post('/query', async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Query is required' 
        });
      }
  
      const db = req.db;
      const response = await processQuery(query, db);
  
      res.json({
        success: true,
        response: response.answer,
        responseType: response.responseType || 'default',
        studentData: response.studentData || {},
        data: response.data,
        sources: response.sources,
        mongoQuery: response.mongoQuery || null,
        timestamp: new Date().toISOString()
      });
  
    } catch (error) {
      console.error('AI Assistant error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process query',
        message: error.message 
      });
    }
  });
  
router.get('/debug', async (req, res) => {
  try {
    const db = req.db;
    
    const allStudents = await db.collection('students').find({}).limit(10).toArray();
    const totalCount = await db.collection('students').countDocuments({});
    const streams = await db.collection('students').distinct('stream');
    
    res.json({
      success: true,
      databaseName: db.databaseName,
      totalStudents: totalCount,
      allStudents: allStudents,
      availableStreams: streams,
      message: 'Database debug info'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
async function contextualSearch(entities, db, query) {
    // Fallback intelligent search
    if (entities.studentName) {
      return await getStudentDetailsAdvanced(entities, db);
    }
    
    if (entities.stream) {
      return await listStudentsAdvanced(entities, db);
    }
    
    return {
      answer: `I couldn't understand "${query}". Try asking about specific students, streams, or attendance.`,
      data: null,
      sources: [],
      mongoQuery: null
    };
  }
  
// ============================================================================
// ADVANCED NLP & GRAMMAR CORRECTION
// ============================================================================

function preprocessQuery(query) {
    // Trim and normalize
    let processed = query.trim();
    
    // Grammar corrections - common mistakes
    const corrections = {
      'stuent': 'student',
      'studnet': 'student',
      'studen': 'student',
      'studnets': 'students',
      'sudent': 'student',
      'atendance': 'attendance',
      'attendnce': 'attendance',
      'attandance': 'attendance',
      'subjct': 'subject',
      'subjet': 'subject',
      'shoow': 'show',
      'shw': 'show',
      'lst': 'list',
      'lsit': 'list',
      'fnd': 'find',
      'fn': 'find',
      'sem': 'semester',
      'smester': 'semester',
      'semster': 'semester'
    };
    
    // Apply corrections
    Object.keys(corrections).forEach(wrong => {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      processed = processed.replace(regex, corrections[wrong]);
    });
    
    // Remove filler words
    const fillerWords = ['please', 'can you', 'could you', 'would you', 'i want', 'i need', 'just', 'really'];
    fillerWords.forEach(filler => {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      processed = processed.replace(regex, '');
    });
    
    // Clean extra spaces
    processed = processed.replace(/\s+/g, ' ').trim();
    
    return processed;
  }
  
  // Fuzzy string matching for names
  function fuzzyMatch(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Levenshtein distance
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(s1, s2);
    return (longer.length - distance) / longer.length;
  }
  
  function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
async function extractEntitiesAdvanced(queryLower, queryTrimmed, entities, db) {
    // Extract Student ID (multiple formats)
    const idPatterns = [
      /\b([A-Z]{2}\d{1}[A-Z]{2}\d{2}[A-Z]\d{5})\b/i,  // UI8ER23C00025
      /\b([A-Z]{3}-[A-Z]{3,4}-\d{4}-\d{3})\b/i
    ];
    
    for (const pattern of idPatterns) {
      const match = queryTrimmed.match(pattern);
      if (match) {
        entities.studentID = match[1].toUpperCase();
        break;
      }
    }
    
    // Extract Student Name with fuzzy matching
    if (!entities.studentID) {
      const namePatterns = [
        /(?:find|search|get|show|info|details?|about|student|for|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/i
      ];
      
      for (const pattern of namePatterns) {
        const match = queryTrimmed.match(pattern);
        if (match) {
          const potentialName = match[1];
          
          try {
            // Fuzzy match against database
            const allStudents = await db.collection('students')
              .find({ isActive: true })
              .limit(100)
              .toArray();
            
            let bestMatch = null;
            let bestScore = 0.6; // Minimum threshold
            
            for (const student of allStudents) {
              const score = fuzzyMatch(student.name, potentialName);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = student.name;
              }
            }
            
            if (bestMatch) {
              entities.studentName = bestMatch;
              console.log(`Fuzzy matched "${potentialName}" to "${bestMatch}" (score: ${bestScore.toFixed(2)})`);
            } else {
              entities.studentName = potentialName;
            }
          } catch (error) {
            console.error('Fuzzy match error:', error);
            entities.studentName = potentialName;
          }
          break;
        }
      }
    }
    
    // Extract Stream
    const streamPatterns = {
      'bca': 'BCA',
      'b.c.a': 'BCA',
      'bba': 'BBA',
      'b.b.a': 'BBA',
      'bcom': 'BCOM',
      'b.com': 'BCOM',
      'bcom a&f': 'BCOM A&F',
      'bda': 'BDA'
    };
    
    for (const [pattern, normalized] of Object.entries(streamPatterns)) {
      if (queryLower.includes(pattern)) {
        entities.stream = normalized;
        break;
      }
    }
    
    // Extract Semester
    const semPatterns = [
      /\bsem(?:ester)?\s*(\d+)\b/i,
      /\b(\d+)(?:st|nd|rd|th)\s*sem(?:ester)?\b/i,
      /\bs(\d+)\b/i
    ];
    
    for (const pattern of semPatterns) {
      const match = queryLower.match(pattern);
      if (match) {
        entities.semester = parseInt(match[1]);
        break;
      }
    }
    
    // Extract Language
    const languages = ['kannada', 'hindi', 'sanskrit', 'tamil', 'english'];
    for (const lang of languages) {
      if (queryLower.includes(lang)) {
        entities.language = lang.charAt(0).toUpperCase() + lang.slice(1);
        break;
      }
    }
    
    // Extract Elective
    const electives = ['cloud computing', 'cyber security', 'data science'];
    for (const elective of electives) {
      if (queryLower.includes(elective)) {
        entities.elective = elective.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
      }
    }
  }
// ============================================================================
// MAIN QUERY PROCESSOR
// ============================================================================
// ============================================================================
// MAIN QUERY PROCESSOR
// ============================================================================
async function processQuery(query, db) {
    try {
      // PREPROCESS with grammar correction
      const processedQuery = preprocessQuery(query);
      const queryLower = processedQuery.toLowerCase();
      const queryTrimmed = processedQuery.trim();
      
      console.log(`Original: "${query}"`);
      console.log(`Processed: "${processedQuery}"`);
      
      const intent = await detectIntentAdvanced(queryLower, queryTrimmed, db);
      
      console.log(`Detected intent: ${intent.type}`, intent.entities);
      
      // Route to appropriate handler based on intent
      switch (intent.type) {
        case 'STUDENT_DETAILS':
          return await getStudentDetailsAdvanced(intent.entities, db);
        
        case 'STUDENT_LIST':
          return await listStudentsAdvanced(intent.entities, db);
        
        case 'STUDENT_COUNT':
          return await countStudentsAdvanced(intent.entities, db);
        
        case 'SUBJECT_LIST':
          return await listSubjectsAdvanced(intent.entities, db);
        
        case 'SUBJECT_DETAILS':
          return await getSubjectDetails(intent.entities, db);
        
        case 'ATTENDANCE_VIEW':
          return await viewAttendance(intent.entities, db);
        
        case 'ATTENDANCE_ANALYSIS':
          return await analyzeAttendance(intent.entities, db);
        
        case 'ABSENT_STUDENTS':
          return await getAbsentStudentsAdvanced(intent.entities, db);
        
        case 'PRESENT_STUDENTS':
          return await getPresentStudentsAdvanced(intent.entities, db);
        
        case 'STATISTICS':
          return await getStatistics(intent.entities, db);
        
        case 'COMPARISON':
          return await compareStreams(intent.entities, db);
        
        case 'LANGUAGE_ELECTIVE_INFO':
          return await getLanguageElectiveInfo(intent.entities, db);
        
        case 'CONTEXTUAL_SEARCH':
          return await contextualSearch(intent.entities, db, processedQuery);
        
        default:
          return {
            answer: `I'm not sure how to help with that. Try asking about students, subjects, or attendance.`,
            data: null,
            sources: [],
            mongoQuery: null
          };
      }
      
    } catch (error) {
      console.error('Error in processQuery:', error);
      return {
        answer: "I encountered an error processing your request. Please try again.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  

  async function getStatistics(entities, db) {
    try {
      const totalStudents = await db.collection('students').countDocuments({ isActive: true });
      const totalSubjects = await db.collection('subjects').countDocuments({ isActive: true });
      const totalStreams = await db.collection('streams').countDocuments({ isActive: true });
      
      // Stream-wise breakdown
      const streamStats = await db.collection('students').aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$stream', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
      
      // Semester-wise breakdown
      const semesterStats = await db.collection('students').aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]).toArray();
      
      let answer = `<h3>System Statistics</h3>\n\n`;
      
      answer += `<h4>Overview</h4>\n`;
      answer += `<ul>\n`;
      answer += `  <li><strong>Total Students:</strong> ${totalStudents}</li>\n`;
      answer += `  <li><strong>Total Subjects:</strong> ${totalSubjects}</li>\n`;
      answer += `  <li><strong>Total Streams:</strong> ${totalStreams}</li>\n`;
      answer += `</ul>\n\n`;
      
      answer += `<h4>Stream-wise Distribution</h4>\n`;
      answer += `<table>\n`;
      answer += `  <thead><tr><th>Stream</th><th>Students</th></tr></thead>\n`;
      answer += `  <tbody>\n`;
      streamStats.forEach(s => {
        answer += `    <tr><td>${s._id}</td><td>${s.count}</td></tr>\n`;
      });
      answer += `  </tbody>\n`;
      answer += `</table>\n\n`;
      
      answer += `<h4>Semester-wise Distribution</h4>\n`;
      answer += `<table>\n`;
      answer += `  <thead><tr><th>Semester</th><th>Students</th></tr></thead>\n`;
      answer += `  <tbody>\n`;
      semesterStats.forEach(s => {
        answer += `    <tr><td>Semester ${s._id}</td><td>${s.count}</td></tr>\n`;
      });
      answer += `  </tbody>\n`;
      answer += `</table>\n\n`;
      
      return {
        answer,
        responseType: 'statistics',
        data: { totalStudents, totalSubjects, streamStats, semesterStats },
        sources: ['students', 'subjects', 'streams'],
        mongoQuery: 'Aggregation queries'
      };
      
    } catch (error) {
      console.error('Error in getStatistics:', error);
      return {
        answer: "Error fetching statistics.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
// ============================================================================
// INTENT DETECTION
// ============================================================================
async function detectIntentAdvanced(queryLower, queryTrimmed, db) {
    const intent = {
      type: 'UNKNOWN',
      confidence: 0.0,
      entities: {
        studentName: null,
        studentID: null,
        stream: null,
        semester: null,
        subject: null,
        date: null,
        language: null,
        elective: null,
        count: false,
        list: false,
        comparison: false
      }
    };
    
    await extractEntitiesAdvanced(queryLower, queryTrimmed, intent.entities, db);
    
    // PRIORITY 1: Direct student search (name or ID)
    if (intent.entities.studentID) {
      intent.type = 'STUDENT_DETAILS';
      intent.confidence = 1.0;
      return intent;
    }
    
    if (intent.entities.studentName && 
        !queryLower.match(/\b(list|show all|how many|count)\b/)) {
      intent.type = 'STUDENT_DETAILS';
      intent.confidence = 0.9;
      return intent;
    }
    
    // PRIORITY 2: List/Count operations
    if (queryLower.match(/\b(list|show all|get all|display all)\b/) &&
        queryLower.match(/\b(student|people)\b/)) {
      intent.type = 'STUDENT_LIST';
      intent.confidence = 0.95;
      return intent;
    }
    
    if (queryLower.match(/\b(how many|count|total|number of)\b/) &&
        queryLower.match(/\b(student|people)\b/)) {
      intent.entities.count = true;
      intent.type = 'STUDENT_COUNT';
      intent.confidence = 0.95;
      return intent;
    }
    
    // PRIORITY 3: Subject queries
    if (queryLower.match(/\b(subject|course|curriculum|module)\b/)) {
      if (intent.entities.subject) {
        intent.type = 'SUBJECT_DETAILS';
        intent.confidence = 0.9;
      } else {
        intent.type = 'SUBJECT_LIST';
        intent.confidence = 0.85;
      }
      return intent;
    }
    
    // PRIORITY 4: Attendance
    if (queryLower.match(/\b(attendance|present|absent)\b/)) {
      if (queryLower.match(/\b(analysis|trend|percentage|stats)\b/)) {
        intent.type = 'ATTENDANCE_ANALYSIS';
        intent.confidence = 0.9;
      } else if (queryLower.match(/\b(absent|missed)\b/)) {
        intent.type = 'ABSENT_STUDENTS';
        intent.confidence = 0.9;
      } else if (queryLower.match(/\b(present|attended)\b/)) {
        intent.type = 'PRESENT_STUDENTS';
        intent.confidence = 0.9;
      } else {
        intent.type = 'ATTENDANCE_VIEW';
        intent.confidence = 0.85;
      }
      return intent;
    }
    
    // PRIORITY 5: Statistics & Analytics
    if (queryLower.match(/\b(statistics|stats|overview|summary|dashboard)\b/)) {
      intent.type = 'STATISTICS';
      intent.confidence = 0.9;
      return intent;
    }
    
    // PRIORITY 6: Comparison
    if (queryLower.match(/\b(compare|vs|versus|difference between)\b/)) {
      intent.entities.comparison = true;
      intent.type = 'COMPARISON';
      intent.confidence = 0.9;
      return intent;
    }
    
    // PRIORITY 7: Language/Elective distribution
    if (queryLower.match(/\b(language|elective|chose|selected|distribution)\b/)) {
      intent.type = 'LANGUAGE_ELECTIVE_INFO';
      intent.confidence = 0.85;
      return intent;
    }
    
    // FALLBACK: Contextual intelligent search
    if (queryTrimmed.length > 2) {
      intent.type = 'CONTEXTUAL_SEARCH';
      intent.confidence = 0.5;
      return intent;
    }
    
    return intent;
  }
  

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

function extractEntities(queryLower, queryTrimmed, entities) {
  // Extract Student ID
  const idMatch = queryTrimmed.match(/\b([A-Z]{3}-[A-Z]{3,4}-\d{4}-\d{3})\b/);
  if (idMatch) entities.studentID = idMatch[1];
  
  // Extract Student Name
  if (!entities.studentID) {
    const justNamePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/i;
    const nameWithKeyword = /(?:find|search|get|show|info|details?|about|student|for|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
    
    if (justNamePattern.test(queryTrimmed)) {
      entities.studentName = queryTrimmed;
    } else {
      const match = nameWithKeyword.exec(queryTrimmed);
      if (match) entities.studentName = match[1];
    }
  }
  
  // Extract Stream
  const streamMatch = queryLower.match(/\b(bca|bba|bcom|bda|b\.?com)\b/i);
  if (streamMatch) entities.stream = streamMatch[1].toUpperCase().replace('B.COM', 'BCOM');
  
  // Extract Semester
  const semesterMatch = queryLower.match(/\bsem(?:ester)?\s*(\d+)\b/i);
  if (semesterMatch) entities.semester = parseInt(semesterMatch[1]);
  
  // Extract Subject
  const subjectMatch = queryTrimmed.match(/(?:subject|course)\s+([A-Z][A-Z\s&]+?)(?:\s|$)/i) ||
                       queryTrimmed.match(/\b([A-Z]{3,}\s*(?:ARCHITECTURE|PROGRAMMING|VALUES|STRUCTURES|MANAGEMENT))\b/i);
  if (subjectMatch) entities.subject = subjectMatch[1].trim();
  
  // Extract Language
  const languageMatch = queryLower.match(/\b(kannada|hindi|sanskrit|tamil|english)\b/i);
  if (languageMatch) entities.language = languageMatch[1].toUpperCase();
}

// ============================================================================
// ADD ALL MISSING STUB FUNCTIONS
// ============================================================================

async function searchMultipleStudents(entities, db) {
  return await listStudentsAdvanced(entities, db);
}

async function getAbsentStudentsAdvanced(entities, db) {
  return {
    answer: "Absent students feature - Under development",
    data: null,
    sources: [],
    mongoQuery: null
  };
}

async function getPresentStudentsAdvanced(entities, db) {
  return {
    answer: "Present students feature - Under development",
    data: null,
    sources: [],
    mongoQuery: null
  };
}

async function getStreamsAdvanced(db) {
  try {
    const streams = await db.collection('streams').find({ isActive: true }).toArray();
    
    let answer = `<h3>Available Streams</h3>\n\n`;
    answer += `<table>
<thead>
<tr>
<th>No.</th>
<th>Stream Name</th>
<th>Stream Code</th>
<th>Semesters</th>
</tr>
</thead>
<tbody>\n`;
    
    streams.forEach((stream, i) => {
      answer += `<tr>
<td>${i + 1}</td>
<td><strong>${stream.name}</strong></td>
<td>${stream.streamCode}</td>
<td>${stream.semesters}</td>
</tr>\n`;
    });
    
    answer += `</tbody>
</table>`;
    
    return {
      answer,
      data: { streams },
      sources: ['streams'],
      mongoQuery: `db.streams.find({isActive:true})`
    };
  } catch (error) {
    return {
      answer: "Error fetching streams.",
      data: null,
      sources: [],
      mongoQuery: null
    };
  }
}

async function getLanguageElectiveAdvanced(entities, db) {
  return {
    answer: "Language/Elective distribution feature - Under development",
    data: null,
    sources: [],
    mongoQuery: null
  };
}

async function getTeacherInfoAdvanced(entities, db) {
  return {
    answer: "Teacher information feature - Under development",
    data: null,
    sources: [],
    mongoQuery: null
  };
}



// ============================================================================
// ADVANCED STUDENT DETAILS - WITH CROSS-REFERENCING
// ============================================================================

// ============================================================================
// PART 2: COMPLETE HANDLER FUNCTIONS
// ============================================================================

async function getStudentDetailsAdvanced(entities, db) {
    try {
      let student;
      let searchQuery = {};
      
      // Search by ID
      if (entities.studentID) {
        student = await db.collection('students').findOne({
          studentID: entities.studentID,
          isActive: true
        });
        searchQuery = { studentID: entities.studentID, isActive: true };
      }
      // Search by name
      else if (entities.studentName) {
        student = await db.collection('students').findOne({
          name: new RegExp(`^${entities.studentName}$`, 'i'),
          isActive: true
        });
        
        if (!student) {
          const similar = await db.collection('students').find({
            name: new RegExp(entities.studentName, 'i'),
            isActive: true
          }).limit(5).toArray();
          
          if (similar.length === 1) {
            student = similar[0];
          } else if (similar.length > 1) {
            return formatMultipleStudentsFound(similar);
          }
        }
        
        searchQuery = { name: new RegExp(entities.studentName, 'i'), isActive: true };
      }
      
      if (!student) {
        return {
          answer: `No student found${entities.studentName ? ` for "${entities.studentName}"` : ''}.`,
          data: null,
          sources: ['students'],
          mongoQuery: `db.students.findOne(${JSON.stringify(searchQuery)})`
        };
      }
      
      // Get subjects for this student's stream/semester
      const subjects = await db.collection('subjects').find({
        stream: student.stream,
        semester: student.semester,
        isActive: true
      }).toArray();
      
      // Get attendance records
      const attendanceRecords = await db.collection('attendance').find({
        stream: student.stream,
        semester: student.semester,
        studentsPresent: student.studentID
      }).toArray();
      
      // Calculate total classes
      const totalClasses = await db.collection('attendance').countDocuments({
        stream: student.stream,
        semester: student.semester
      });
      
      const attendedClasses = attendanceRecords.length;
      const attendancePercentage = totalClasses > 0 ? ((attendedClasses / totalClasses) * 100).toFixed(1) : 0;
      
      // Format response
      let answer = `<h3>Student Profile: ${student.name}</h3>\n\n`;
      
      answer += `<h4>Basic Information</h4>\n`;
      answer += `<ul>\n`;
      answer += `  <li><strong>Student ID:</strong> ${student.studentID}</li>\n`;
      answer += `  <li><strong>Stream:</strong> ${student.stream}</li>\n`;
      answer += `  <li><strong>Semester:</strong> ${student.semester}</li>\n`;
      answer += `  <li><strong>Academic Year:</strong> ${student.academicYear}</li>\n`;
      answer += `  <li><strong>Status:</strong> ${student.isActive ? 'Active' : 'Inactive'}</li>\n`;
      answer += `</ul>\n\n`;
      
      answer += `<h4>Contact Information</h4>\n`;
      answer += `<ul>\n`;
      answer += `  <li><strong>Parent Phone:</strong> ${student.parentPhone}</li>\n`;
      answer += `</ul>\n\n`;
      
      if (student.languageSubject || student.electiveSubject) {
        answer += `<h4>Chosen Subjects</h4>\n`;
        answer += `<ul>\n`;
        if (student.languageSubject) answer += `  <li><strong>Language:</strong> ${student.languageSubject}</li>\n`;
        if (student.electiveSubject) answer += `  <li><strong>Elective:</strong> ${student.electiveSubject}</li>\n`;
        answer += `</ul>\n\n`;
      }
      
      // Stats table
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>ATTENDANCE</th>\n`;
      answer += `      <th>CLASSES ATTENDED</th>\n`;
      answer += `      <th>TOTAL SUBJECTS</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      answer += `    <tr>\n`;
      answer += `      <td>${attendancePercentage}%</td>\n`;
      answer += `      <td>${attendedClasses}/${totalClasses}</td>\n`;
      answer += `      <td>${subjects.length}</td>\n`;
      answer += `    </tr>\n`;
      answer += `  </tbody>\n`;
      answer += `</table>\n\n`;
      
      if (parseFloat(attendancePercentage) < 75) {
        answer += `<p class="warning">⚠️ <strong>Warning:</strong> Attendance below 75% – <em>Action Required</em></p>`;
      }
      
      return {
        answer,
        responseType: 'student_profile',
        studentData: {
          name: student.name,
          stream: student.stream,
          semester: student.semester
        },
        data: {
          student,
          subjects,
          attendanceSummary: {
            attended: attendedClasses,
            total: totalClasses,
            percentage: attendancePercentage
          }
        },
        sources: ['students', 'subjects', 'attendance'],
        mongoQuery: `db.students.findOne(${JSON.stringify(searchQuery)})`
      };
      
    } catch (error) {
      console.error('Error in getStudentDetailsAdvanced:', error);
      return {
        answer: "Error fetching student details.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  async function listStudentsAdvanced(entities, db) {
    try {
      const filter = { isActive: true };
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.language) filter.languageSubject = entities.language;
      if (entities.elective) filter.electiveSubject = entities.elective;
      
      const students = await db.collection('students')
        .find(filter)
        .sort({ name: 1 })
        .toArray();
      
      if (students.length === 0) {
        return {
          answer: `No students found matching your criteria.`,
          data: null,
          sources: ['students'],
          mongoQuery: `db.students.find(${JSON.stringify(filter)})`
        };
      }
      
      let answer = `<h3>Students List (${students.length} found)</h3>\n\n`;
      
      // Show filters
      const filters = [];
      if (entities.stream) filters.push(`<strong>Stream:</strong>${entities.stream}`);
      if (entities.semester) filters.push(`<strong>Semester:</strong>${entities.semester}`);
      if (entities.language) filters.push(`<strong>Language:</strong>${entities.language}`);
      if (filters.length > 0) {
        answer += `<p>${filters.join(' • ')}</p>\n\n`;
      }
      
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>No.</th>\n`;
      answer += `      <th>Name</th>\n`;
      answer += `      <th>Student ID</th>\n`;
      answer += `      <th>Stream</th>\n`;
      answer += `      <th>Semester</th>\n`;
      answer += `      <th>Language</th>\n`;
      answer += `      <th>Elective</th>\n`;
      answer += `      <th>Phone</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      
      students.forEach((s, i) => {
        answer += `    <tr>\n`;
        answer += `      <td>${i + 1}</td>\n`;
        answer += `      <td><strong>${s.name}</strong></td>\n`;
        answer += `      <td>${s.studentID}</td>\n`;
        answer += `      <td>${s.stream}</td>\n`;
        answer += `      <td>${s.semester}</td>\n`;
        answer += `      <td>${s.languageSubject || '-'}</td>\n`;
        answer += `      <td>${s.electiveSubject || '-'}</td>\n`;
        answer += `      <td>${s.parentPhone}</td>\n`;
        answer += `    </tr>\n`;
      });
      
      answer += `  </tbody>\n`;
      answer += `</table>\n\n`;
      
      return {
        answer,
        responseType: 'student_list',
        data: { students, filter, count: students.length },
        sources: ['students'],
        mongoQuery: `db.students.find(${JSON.stringify(filter)}).sort({name:1})`
      };
      
    } catch (error) {
      console.error('Error in listStudentsAdvanced:', error);
      return {
        answer: "Error fetching students list.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  async function countStudentsAdvanced(entities, db) {
    try {
      const filter = { isActive: true };
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.language) filter.languageSubject = entities.language;
      
      const count = await db.collection('students').countDocuments(filter);
      
      let answer = `<h3>Student Count</h3>\n\n`;
      answer += `<p>There are <strong>${count} students</strong>`;
      
      const filters = [];
      if (entities.stream) filters.push(`in ${entities.stream}`);
      if (entities.semester) filters.push(`semester ${entities.semester}`);
      if (entities.language) filters.push(`studying ${entities.language}`);
      
      if (filters.length > 0) {
        answer += ` ${filters.join(', ')}`;
      }
      
      answer += `.</p>`;
      
      return {
        answer,
        responseType: 'student_count',
        data: { count, filter },
        sources: ['students'],
        mongoQuery: `db.students.countDocuments(${JSON.stringify(filter)})`
      };
      
    } catch (error) {
      console.error('Error in countStudentsAdvanced:', error);
      return {
        answer: "Error counting students.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // SUBJECT HANDLERS
  // ============================================================================
  async function listSubjectsAdvanced(entities, db) {
    try {
      const filter = { isActive: true };
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      
      const subjects = await db.collection('subjects')
        .find(filter)
        .sort({ subjectType: 1, name: 1 })
        .toArray();
      
      if (subjects.length === 0) {
        return {
          answer: `No subjects found for the given criteria.`,
          responseType: 'subject_list',
          studentData: {
            stream: entities.stream,
            semester: entities.semester,
          },
          data: { subjects, filter },
          sources: ['subjects'],
          mongoQuery: `db.subjects.find(${JSON.stringify(filter)})`
        };
      }
      
      let answer = `<h3>Subjects (${subjects.length} found)</h3>\n\n`;
      
      if (entities.stream || entities.semester) {
        answer += `<p><strong>Stream:</strong> ${entities.stream || 'All'} • <strong>Semester:</strong> ${entities.semester || 'All'}</p>\n\n`;
      }
      
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>No.</th>\n`;
      answer += `      <th>Subject Name</th>\n`;
      answer += `      <th>Code</th>\n`;
      answer += `      <th>Type</th>\n`;
      answer += `      <th>Stream</th>\n`;
      answer += `      <th>Semester</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      
      subjects.forEach((s, i) => {
        answer += `    <tr>\n`;
        answer += `      <td>${i + 1}</td>\n`;
        answer += `      <td><strong>${s.name}</strong></td>\n`;
        answer += `      <td>${s.subjectCode}</td>\n`;
        answer += `      <td>${s.subjectType}</td>\n`;
        answer += `      <td>${s.stream}</td>\n`;
        answer += `      <td>${s.semester}</td>\n`;
        answer += `    </tr>\n`;
      });
      
      answer += `  </tbody>\n`;
      answer += `</table>\n\n`;
      
      return {
        answer,
        responseType: 'subject_list',
        studentData: {
          stream: entities.stream,
          semester: entities.semester
        },
        data: { subjects, filter },
        sources: ['subjects'],
        mongoQuery: `db.subjects.find(${JSON.stringify(filter)})`
      };
      
    } catch (error) {
      console.error('Error in listSubjectsAdvanced:', error);
      return {
        answer: "Error fetching subjects.",
        responseType: 'subject_list',
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  

// Helper function
function formatMultipleStudentsFound(students) {
    let answer = `<h3>Found ${students.length} Students</h3>\n\n`;
    answer += `<p>Please specify which one:</p>\n\n`;
    
    answer += `<table>\n`;
    answer += `  <thead>\n`;
    answer += `    <tr>\n`;
    answer += `      <th>No.</th>\n`;
    answer += `      <th>Name</th>\n`;
    answer += `      <th>Student ID</th>\n`;
    answer += `      <th>Stream</th>\n`;
    answer += `      <th>Semester</th>\n`;
    answer += `      <th>Phone</th>\n`;
    answer += `    </tr>\n`;
    answer += `  </thead>\n`;
    answer += `  <tbody>\n`;
    
    students.forEach((s, i) => {
      answer += `    <tr>\n`;
      answer += `      <td>${i + 1}</td>\n`;
      answer += `      <td><strong>${s.name}</strong></td>\n`;
      answer += `      <td>${s.studentID}</td>\n`;
      answer += `      <td>${s.stream}</td>\n`;
      answer += `      <td>${s.semester}</td>\n`;
      answer += `      <td>${s.parentPhone}</td>\n`;
      answer += `    </tr>\n`;
    });
    
    answer += `  </tbody>\n`;
    answer += `</table>\n\n`;
    answer += `<p>Type the exact name or ID for full details.</p>`;
    
    return {
      answer,
      responseType: 'multiple_students',
      data: { students },
      sources: ['students'],
      mongoQuery: 'Multiple matches query'
    };
  }

  // ============================================================================
  // LIST STUDENTS ADVANCED
  // ============================================================================
  async function listStudentsAdvanced(entities, db) {
    try {
      let filter = { isActive: true };
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.language) filter.languageSubject = entities.language;
      if (entities.elective) filter.electiveSubject = new RegExp(entities.elective, 'i');
      
      const students = await db.collection('students')
        .find(filter)
        .sort({ name: 1 })
        .toArray();
      
      if (students.length === 0) {
        return {
          answer: `No students found with the specified criteria.`,
          data: null,
          sources: ['students'],
          mongoQuery: `db.students.find(${JSON.stringify(filter)})`
        };
      }
      
      // Build filter summary WITHOUT stars
      let filterSummary = [];
      if (entities.stream) filterSummary.push(`<strong>Stream:</strong> ${entities.stream}`);
      if (entities.semester) filterSummary.push(`<strong>Semester:</strong> ${entities.semester}`);
      if (entities.language) filterSummary.push(`<strong>Language:</strong> ${entities.language}`);
      if (entities.elective) filterSummary.push(`<strong>Elective:</strong> ${entities.elective}`);
      
      let answer = `<h3>Students List (${students.length} found)</h3>\n\n`;
      
      if (filterSummary.length > 0) {
        answer += `<p>${filterSummary.join(' • ')}</p>\n\n`;
      }
      
      // Clean table format
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>No.</th>\n`;
      answer += `      <th>Student Name</th>\n`;
      answer += `      <th>Student ID</th>\n`;
      answer += `      <th>Stream</th>\n`;
      answer += `      <th>Semester</th>\n`;
      answer += `      <th>Language</th>\n`;
      answer += `      <th>Elective</th>\n`;
      answer += `      <th>Parent Phone</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      
      students.forEach((s, i) => {
        answer += `    <tr>\n`;
        answer += `      <td>${i + 1}</td>\n`;
        answer += `      <td><strong>${s.name}</strong></td>\n`;
        answer += `      <td>${s.studentID}</td>\n`;
        answer += `      <td>${s.stream}</td>\n`;
        answer += `      <td>${s.semester}</td>\n`;
        answer += `      <td>${s.languageSubject || '-'}</td>\n`;
        answer += `      <td>${s.electiveSubject || '-'}</td>\n`;
        answer += `      <td>${s.parentPhone || '-'}</td>\n`;
        answer += `    </tr>\n`;
      });
      
      answer += `  </tbody>\n`;
      answer += `</table>\n`;
      
      return {
        answer,
        data: { students, filter, count: students.length },
        sources: ['students'],
        mongoQuery: `db.students.find(${JSON.stringify(filter)}).sort({name:1})`
      };
      
    } catch (error) {
      console.error('Error in listStudentsAdvanced:', error);
      return {
        answer: "Error listing students. Please try again.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  
  // ============================================================================
  // COUNT STUDENTS ADVANCED
  // ============================================================================
  
  async function countStudentsAdvanced(entities, db) {
    try {
      let filter = { isActive: true };
      let description = 'All active students';
  
      if (entities.stream) {
        filter.stream = entities.stream;
        description = entities.stream;
      }
      
      if (entities.semester) {
        filter.semester = entities.semester;
        description = entities.stream 
          ? `${entities.stream} Semester ${entities.semester}` 
          : `Semester ${entities.semester}`;
      }
  
      const count = await db.collection('students').countDocuments(filter);
  
      let answer = `<h3>Student Count</h3>\n\n`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">${description}</div>`;
      answer += `<div class="stat-card-value">${count}</div>`;
      answer += `</div>\n\n`;
  
      if (count === 0) {
        answer += `<p>No students found with this criteria.</p>`;
      }
  
      return {
        answer,
        data: { count, filter, description },
        sources: ['students'],
        mongoQuery: `db.students.countDocuments(${JSON.stringify(filter)})`
      };
    } catch (error) {
      return {
        answer: "Error counting students.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // GET SUBJECTS ADVANCED
  // ============================================================================
  
  async function getSubjectsAdvanced(entities, db) {
    try {
      if (!entities.stream || !entities.semester) {
        return {
          answer: "Please specify stream and semester.\n\nExample: 'Show subjects for BCA semester 3'",
          data: null,
          sources: [],
          mongoQuery: null
        };
      }
  
      const mongoQuery = { 
        stream: entities.stream, 
        semester: entities.semester, 
        isActive: true 
      };
  
      const subjects = await db.collection('subjects').find(mongoQuery).toArray();
  
      if (subjects.length === 0) {
        return {
          answer: `No subjects found for ${entities.stream} Semester ${entities.semester}.`,
          data: null,
          sources: ['subjects'],
          mongoQuery: `db.subjects.find(${JSON.stringify(mongoQuery)})`
        };
      }
  
      const studentCount = await db.collection('students').countDocuments({
        stream: entities.stream,
        semester: entities.semester,
        isActive: true
      });
  
      const coreSubjects = subjects.filter(s => s.subjectType === 'CORE');
      const electiveSubjects = subjects.filter(s => s.subjectType === 'ELECTIVE');
      const languageSubjects = subjects.filter(s => s.isLanguageSubject);
  
      let answer = `<h3>Subjects for ${entities.stream} Semester ${entities.semester}</h3>\n\n`;
      answer += `<p><strong>Total Subjects:</strong> ${subjects.length} | <strong>Enrolled Students:</strong> ${studentCount}</p>\n\n`;
  
      if (coreSubjects.length > 0) {
        answer += `<h4>Core Subjects (${coreSubjects.length})</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>No.</th>
  <th>Subject Name</th>
  <th>Subject Code</th>
  <th>Type</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        coreSubjects.forEach((subject, index) => {
          answer += `<tr>
  <td>${index + 1}</td>
  <td><strong>${subject.name}</strong></td>
  <td>${subject.subjectCode}</td>
  <td><span class="badge info">Core</span></td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>\n\n`;
      }
  
      if (electiveSubjects.length > 0) {
        answer += `<h4>Elective Subjects (${electiveSubjects.length})</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>No.</th>
  <th>Subject Name</th>
  <th>Subject Code</th>
  <th>Type</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        electiveSubjects.forEach((subject, index) => {
          answer += `<tr>
  <td>${index + 1}</td>
  <td><strong>${subject.name}</strong></td>
  <td>${subject.subjectCode}</td>
  <td><span class="badge warning">Elective</span></td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>\n\n`;
      }
  
      if (languageSubjects.length > 0) {
        answer += `<h4>Language Subjects (${languageSubjects.length})</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>No.</th>
  <th>Subject Name</th>
  <th>Subject Code</th>
  <th>Language</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        languageSubjects.forEach((subject, index) => {
          answer += `<tr>
  <td>${index + 1}</td>
  <td><strong>${subject.name}</strong></td>
  <td>${subject.subjectCode}</td>
  <td>${subject.languageType}</td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>`;
      }
  
      return {
        answer,
        data: { subjects, studentCount },
        sources: ['subjects', 'students'],
        mongoQuery: `db.subjects.find(${JSON.stringify(mongoQuery)})`
      };
    } catch (error) {
      console.error('Error in getSubjectsAdvanced:', error);
      return {
        answer: "Error fetching subjects.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // GET SUBJECT DETAILS
  // ============================================================================
  
  async function getSubjectDetails(entities, db) {
    try {
      if (!entities.subject) {
        return {
          answer: "Please specify a subject name.",
          data: null,
          sources: [],
          mongoQuery: null
        };
      }
  
      const subject = await db.collection('subjects').findOne({
        name: new RegExp(entities.subject, 'i'),
        isActive: true
      });
  
      if (!subject) {
        return {
          answer: `Subject "${entities.subject}" not found.`,
          data: null,
          sources: ['subjects'],
          mongoQuery: null
        };
      }
  
      const enrolledStudents = await db.collection('students').countDocuments({
        stream: subject.stream,
        semester: subject.semester,
        isActive: true
      });
  
      let answer = `<h3>Subject Details: ${subject.name}</h3>\n\n`;
      answer += `<div class="section">`;
      answer += `<div class="info-row"><span class="info-label">Subject Code:</span><span class="info-value">${subject.subjectCode}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Stream:</span><span class="info-value">${subject.stream}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Semester:</span><span class="info-value">${subject.semester}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Type:</span><span class="info-value">${subject.subjectType}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Enrolled Students:</span><span class="info-value">${enrolledStudents}</span></div>`;
      answer += `</div>`;
  
      return {
        answer,
        data: { subject, enrolledStudents },
        sources: ['subjects', 'students'],
        mongoQuery: `db.subjects.findOne({name:/${entities.subject}/i})`
      };
    } catch (error) {
      return {
        answer: "Error fetching subject details.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  

  // ============================================================================
// PART 3: ATTENDANCE, STATISTICS, ANALYSIS & UTILITY FUNCTIONS
// ============================================================================

// ============================================================================
// GET ATTENDANCE ADVANCED
// ============================================================================

async function getAttendanceAdvanced(entities, db) {
    try {
      let filter = {};
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.subject) filter.subject = new RegExp(entities.subject, 'i');
      if (entities.date) {
        filter.date = {
          $gte: new Date(entities.date.setHours(0, 0, 0, 0)),
          $lt: new Date(entities.date.setHours(23, 59, 59, 999))
        };
      }
  
      const records = await db.collection('attendance')
        .find(filter)
        .sort({ date: -1 })
        .limit(20)
        .toArray();
  
      if (records.length === 0) {
        return {
          answer: "No attendance records found for the specified criteria.",
          data: null,
          sources: ['attendance'],
          mongoQuery: `db.attendance.find(${JSON.stringify(filter)})`
        };
      }
  
      let answer = `<h3>Attendance Records</h3>\n\n`;
      answer += `<p><strong>Total Records:</strong> ${records.length}</p>\n\n`;
      
      answer += `<table>
  <thead>
  <tr>
  <th>Date</th>
  <th>Subject</th>
  <th>Stream</th>
  <th>Time</th>
  <th>Present</th>
  <th>Absent</th>
  <th>Attendance %</th>
  <th>Teacher</th>
  </tr>
  </thead>
  <tbody>\n`;
      
      records.forEach((record) => {
        const percentage = ((record.presentCount / record.totalStudents) * 100).toFixed(1);
        const badgeClass = percentage >= 75 ? 'success' : 'warning';
        
        answer += `<tr>
  <td>${new Date(record.date).toLocaleDateString()}</td>
  <td><strong>${record.subject}</strong></td>
  <td>${record.stream} Sem ${record.semester}</td>
  <td>${record.time}</td>
  <td>${record.presentCount}</td>
  <td>${record.absentCount}</td>
  <td><span class="badge ${badgeClass}">${percentage}%</span></td>
  <td>${record.teacherEmail}</td>
  </tr>\n`;
      });
      
      answer += `</tbody>
  </table>`;
  
      return {
        answer,
        data: { records },
        sources: ['attendance'],
        mongoQuery: `db.attendance.find(${JSON.stringify(filter)}).sort({date:-1}).limit(20)`
      };
    } catch (error) {
      return {
        answer: "Error fetching attendance records.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // ANALYZE ATTENDANCE
  // ============================================================================
  
  async function analyzeAttendance(entities, db) {
    try {
      let filter = {};
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.subject) filter.subject = new RegExp(entities.subject, 'i');
  
      const records = await db.collection('attendance').find(filter).toArray();
  
      if (records.length === 0) {
        return {
          answer: "No attendance records found for analysis.",
          data: null,
          sources: ['attendance'],
          mongoQuery: `db.attendance.find(${JSON.stringify(filter)})`
        };
      }
  
      const totalClasses = records.length;
      const totalPresent = records.reduce((sum, r) => sum + r.presentCount, 0);
      const totalAbsent = records.reduce((sum, r) => sum + r.absentCount, 0);
      const avgAttendanceRate = (records.reduce((sum, r) => sum + (r.presentCount / r.totalStudents * 100), 0) / totalClasses).toFixed(1);
  
      const sorted = records.sort((a, b) => (b.presentCount / b.totalStudents) - (a.presentCount / a.totalStudents));
      const bestDay = sorted[0];
      const worstDay = sorted[sorted.length - 1];
  
      let answer = `<h3>Attendance Analysis</h3>\n\n`;
      
      if (entities.stream) answer += `<p><strong>Stream:</strong> ${entities.stream}</p>`;
      if (entities.semester) answer += `<p><strong>Semester:</strong> ${entities.semester}</p>`;
      if (entities.subject) answer += `<p><strong>Subject:</strong> ${entities.subject}</p>`;
      
      answer += `\n<div class="stat-grid">`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Total Classes</div>`;
      answer += `<div class="stat-card-value">${totalClasses}</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Average Attendance</div>`;
      answer += `<div class="stat-card-value">${avgAttendanceRate}%</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Total Present</div>`;
      answer += `<div class="stat-card-value">${totalPresent}</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Total Absent</div>`;
      answer += `<div class="stat-card-value">${totalAbsent}</div>`;
      answer += `</div>`;
      answer += `</div>\n\n`;
  
      answer += `<div class="section">`;
      answer += `<h4>Best Attendance</h4>`;
      answer += `<div class="info-row"><span class="info-label">Subject:</span><span class="info-value">${bestDay.subject}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(bestDay.date).toLocaleDateString()}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Attendance:</span><span class="info-value">${bestDay.presentCount}/${bestDay.totalStudents} (${((bestDay.presentCount/bestDay.totalStudents)*100).toFixed(1)}%)</span></div>`;
      answer += `</div>\n\n`;
  
      answer += `<div class="section">`;
      answer += `<h4>Lowest Attendance</h4>`;
      answer += `<div class="info-row"><span class="info-label">Subject:</span><span class="info-value">${worstDay.subject}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Date:</span><span class="info-value">${new Date(worstDay.date).toLocaleDateString()}</span></div>`;
      answer += `<div class="info-row"><span class="info-label">Attendance:</span><span class="info-value">${worstDay.presentCount}/${worstDay.totalStudents} (${((worstDay.presentCount/worstDay.totalStudents)*100).toFixed(1)}%)</span></div>`;
      answer += `</div>`;
  
      return {
        answer,
        data: { 
          records, 
          statistics: {
            totalClasses,
            totalPresent,
            totalAbsent,
            avgAttendanceRate,
            bestDay,
            worstDay
          }
        },
        sources: ['attendance'],
        mongoQuery: `db.attendance.find(${JSON.stringify(filter)})`
      };
    } catch (error) {
      return {
        answer: "Error analyzing attendance.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // GET ADVANCED STATISTICS
  // ============================================================================
  
  async function getAdvancedStatistics(entities, db) {
    try {
      const stats = {};
      
      stats.totalStudents = await db.collection('students').countDocuments({ isActive: true });
      stats.totalSubjects = await db.collection('subjects').countDocuments({ isActive: true });
      stats.totalStreams = await db.collection('streams').countDocuments({ isActive: true });
      stats.totalAttendanceRecords = await db.collection('attendance').countDocuments();
  
      const streamCounts = await db.collection('students').aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$stream", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
  
      const semesterCounts = await db.collection('students').aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$semester", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]).toArray();
  
      const languageCounts = await db.collection('students').aggregate([
        { $match: { isActive: true, languageSubject: { $ne: "" } } },
        { $group: { _id: "$languageSubject", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
  
      const allAttendance = await db.collection('attendance').find({}).toArray();
      const overallAttendanceRate = allAttendance.length > 0
        ? (allAttendance.reduce((sum, r) => sum + (r.presentCount / r.totalStudents * 100), 0) / allAttendance.length).toFixed(1)
        : 0;
  
      let answer = `<h3>College Statistics Dashboard</h3>\n\n`;
      
      answer += `<div class="stat-grid">`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Total Students</div>`;
      answer += `<div class="stat-card-value">${stats.totalStudents}</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Active Streams</div>`;
      answer += `<div class="stat-card-value">${stats.totalStreams}</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Total Subjects</div>`;
      answer += `<div class="stat-card-value">${stats.totalSubjects}</div>`;
      answer += `</div>`;
      answer += `<div class="stat-card">`;
      answer += `<div class="stat-card-title">Overall Attendance</div>`;
      answer += `<div class="stat-card-value">${overallAttendanceRate}%</div>`;
      answer += `</div>`;
      answer += `</div>\n\n`;
  
      answer += `<h4>Stream-wise Distribution</h4>\n`;
      answer += `<table>
  <thead>
  <tr>
  <th>Stream</th>
  <th>Students</th>
  <th>Percentage</th>
  <th>Distribution</th>
  </tr>
  </thead>
  <tbody>\n`;
      
      streamCounts.forEach(item => {
        const percentage = ((item.count / stats.totalStudents) * 100).toFixed(1);
        const barLength = Math.round(percentage / 5);
        const bar = '█'.repeat(barLength);
        
        answer += `<tr>
  <td><strong>${item._id}</strong></td>
  <td>${item.count}</td>
  <td>${percentage}%</td>
  <td style="font-family: monospace;">${bar}</td>
  </tr>\n`;
      });
      
      answer += `</tbody>
  </table>\n\n`;
  
      if (semesterCounts.length > 0) {
        answer += `<h4>Semester Distribution</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>Semester</th>
  <th>Students</th>
  <th>Percentage</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        semesterCounts.forEach(item => {
          const percentage = ((item.count / stats.totalStudents) * 100).toFixed(1);
          answer += `<tr>
  <td>Semester ${item._id}</td>
  <td>${item.count}</td>
  <td>${percentage}%</td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>\n\n`;
      }
  
      if (languageCounts.length > 0) {
        answer += `<h4>Language Preferences</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>Language</th>
  <th>Students</th>
  <th>Percentage</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        const totalLang = languageCounts.reduce((sum, l) => sum + l.count, 0);
        languageCounts.forEach(item => {
          const percentage = ((item.count / totalLang) * 100).toFixed(1);
          answer += `<tr>
  <td><strong>${item._id}</strong></td>
  <td>${item.count}</td>
  <td>${percentage}%</td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>`;
      }
  
      return {
        answer,
        data: { 
          stats, 
          streamCounts, 
          semesterCounts, 
          languageCounts,
          overallAttendanceRate 
        },
        sources: ['students', 'subjects', 'streams', 'attendance'],
        mongoQuery: 'Multiple aggregate queries'
      };
    } catch (error) {
      return {
        answer: "Error fetching statistics.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // COMPARE ADVANCED
  // ============================================================================
  
  async function compareAdvanced(entities, db) {
    try {
      const query = entities.studentName || entities.comparison || '';
      const streamMatches = query.match(/\b(bca|bba|bcom|bda)\b/gi) || 
                            [entities.stream, entities.semester].filter(Boolean);
      
      if (!streamMatches || streamMatches.length < 2) {
        return {
          answer: "Please specify at least 2 streams to compare.\n\nExample: 'Compare BCA and BBA'",
          data: null,
          sources: [],
          mongoQuery: null
        };
      }
  
      const stream1 = streamMatches[0].toUpperCase();
      const stream2 = streamMatches[1].toUpperCase();
  
      const [count1, count2, subjects1, subjects2, attendance1, attendance2] = await Promise.all([
        db.collection('students').countDocuments({ stream: stream1, isActive: true }),
        db.collection('students').countDocuments({ stream: stream2, isActive: true }),
        db.collection('subjects').countDocuments({ stream: stream1, isActive: true }),
        db.collection('subjects').countDocuments({ stream: stream2, isActive: true }),
        db.collection('attendance').find({ stream: stream1 }).toArray(),
        db.collection('attendance').find({ stream: stream2 }).toArray()
      ]);
  
      const avgAttendance1 = attendance1.length > 0
        ? (attendance1.reduce((sum, r) => sum + (r.presentCount / r.totalStudents * 100), 0) / attendance1.length).toFixed(1)
        : 0;
  
      const avgAttendance2 = attendance2.length > 0
        ? (attendance2.reduce((sum, r) => sum + (r.presentCount / r.totalStudents * 100), 0) / attendance2.length).toFixed(1)
        : 0;
  
      let answer = `<h3>Comparison: ${stream1} vs ${stream2}</h3>\n\n`;
  
      answer += `<table>
  <thead>
  <tr>
  <th>Metric</th>
  <th>${stream1}</th>
  <th>${stream2}</th>
  <th>Winner</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <td><strong>Student Count</strong></td>
  <td>${count1}</td>
  <td>${count2}</td>
  <td>${count1 > count2 ? stream1 : count2 > count1 ? stream2 : 'Equal'}</td>
  </tr>
  <tr>
  <td><strong>Subjects Offered</strong></td>
  <td>${subjects1}</td>
  <td>${subjects2}</td>
  <td>${subjects1 > subjects2 ? stream1 : subjects2 > subjects1 ? stream2 : 'Equal'}</td>
  </tr>
  <tr>
  <td><strong>Average Attendance</strong></td>
  <td>${avgAttendance1}%</td>
  <td>${avgAttendance2}%</td>
  <td>${parseFloat(avgAttendance1) > parseFloat(avgAttendance2) ? stream1 : parseFloat(avgAttendance2) > parseFloat(avgAttendance1) ? stream2 : 'Equal'}</td>
  </tr>
  <tr>
  <td><strong>Classes Recorded</strong></td>
  <td>${attendance1.length}</td>
  <td>${attendance2.length}</td>
  <td>${attendance1.length > attendance2.length ? stream1 : attendance2.length > attendance1.length ? stream2 : 'Equal'}</td>
  </tr>
  </tbody>
  </table>`;
  
      return {
        answer,
        data: {
          stream1: { name: stream1, students: count1, subjects: subjects1, attendance: avgAttendance1 },
          stream2: { name: stream2, students: count2, subjects: subjects2, attendance: avgAttendance2 }
        },
        sources: ['students', 'subjects', 'attendance'],
        mongoQuery: 'Comparison queries'
      };
    } catch (error) {
      return {
        answer: "Error comparing streams.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // CROSS REFERENCE QUERY
  // ============================================================================
  
  async function crossReferenceQuery(entities, db) {
    try {
      if (entities.subject) {
        const subject = await db.collection('subjects').findOne({
          name: new RegExp(entities.subject, 'i'),
          isActive: true
        });
  
        if (!subject) {
          return {
            answer: `Subject "${entities.subject}" not found.`,
            data: null,
            sources: ['subjects'],
            mongoQuery: null
          };
        }
  
        const students = await db.collection('students').find({
          stream: subject.stream,
          semester: subject.semester,
          isActive: true
        }).sort({ name: 1 }).toArray();
  
        let answer = `<h3>${subject.name}</h3>\n\n`;
        answer += `<div class="section">`;
        answer += `<div class="info-row"><span class="info-label">Code:</span><span class="info-value">${subject.subjectCode}</span></div>`;
        answer += `<div class="info-row"><span class="info-label">Stream:</span><span class="info-value">${subject.stream}</span></div>`;
        answer += `<div class="info-row"><span class="info-label">Semester:</span><span class="info-value">${subject.semester}</span></div>`;
        answer += `<div class="info-row"><span class="info-label">Enrolled Students:</span><span class="info-value">${students.length}</span></div>`;
        answer += `</div>\n\n`;
  
        answer += `<h4>Enrolled Students</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>No.</th>
  <th>Student Name</th>
  <th>Student ID</th>
  </tr>
  </thead>
  <tbody>\n`;
  
        students.slice(0, 30).forEach((s, i) => {
          answer += `<tr>
  <td>${i + 1}</td>
  <td><strong>${s.name}</strong></td>
  <td>${s.studentID}</td>
  </tr>\n`;
        });
  
        answer += `</tbody>
  </table>`;
  
        if (students.length > 30) {
          answer += `\n<p>...and ${students.length - 30} more students</p>`;
        }
  
        return {
          answer,
          data: { subject, students },
          sources: ['subjects', 'students'],
          mongoQuery: `db.students.find({stream:"${subject.stream}",semester:${subject.semester}})`
        };
      }
  
      return {
        answer: "Please specify a subject name for cross-reference.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    } catch (error) {
      return {
        answer: "Error in cross-reference query.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // CONTEXTUAL INTELLIGENT SEARCH
  // ============================================================================
  
  async function contextualIntelligentSearch(query, db) {
    try {
      const searchTerm = query.toLowerCase();
      
      const [subjects, students, streams] = await Promise.all([
        db.collection('subjects').find({
          $or: [
            { name: new RegExp(searchTerm, 'i') },
            { subjectCode: new RegExp(searchTerm, 'i') }
          ],
          isActive: true
        }).limit(5).toArray(),
        
        db.collection('students').find({
          $or: [
            { name: new RegExp(searchTerm, 'i') },
            { studentID: new RegExp(searchTerm, 'i') }
          ],
          isActive: true
        }).limit(5).toArray(),
        
        db.collection('streams').find({
          $or: [
            { name: new RegExp(searchTerm, 'i') },
            { streamCode: new RegExp(searchTerm, 'i') }
          ],
          isActive: true
        }).limit(3).toArray()
      ]);
  
      if (subjects.length === 0 && students.length === 0 && streams.length === 0) {
        return getHelpMessage();
      }
  
      let answer = `<h3>Search Results for "${query}"</h3>\n\n`;
      
      if (students.length > 0) {
        answer += `<h4>Students (${students.length})</h4>\n`;
        answer += `<ul>\n`;
        students.forEach(s => {
          answer += `<li><strong>${s.name}</strong> (${s.studentID}) - ${s.stream} Sem ${s.semester}</li>\n`;
        });
        answer += `</ul>\n\n`;
      }
      
      if (subjects.length > 0) {
        answer += `<h4>Subjects (${subjects.length})</h4>\n`;
        answer += `<ul>\n`;
        subjects.forEach(s => {
          answer += `<li><strong>${s.name}</strong> (${s.subjectCode}) - ${s.stream} Sem ${s.semester}</li>\n`;
        });
        answer += `</ul>\n\n`;
      }
      
      if (streams.length > 0) {
        answer += `<h4>Streams (${streams.length})</h4>\n`;
        answer += `<ul>\n`;
        streams.forEach(s => {
          answer += `<li><strong>${s.name}</strong> (${s.streamCode})</li>\n`;
        });
        answer += `</ul>`;
      }
  
      answer += `\n\n<p>Ask for more details about any result!</p>`;
  
      return {
        answer,
        data: { subjects, students, streams },
        sources: ['subjects', 'students', 'streams'],
        mongoQuery: 'Contextual search across collections'
      };
    } catch (error) {
      return getHelpMessage();
    }
  }
  // ============================================================================
// GET LANGUAGE/ELECTIVE DISTRIBUTION - COMPLETE VERSION
// ============================================================================

async function getLanguageElectiveAdvanced(entities, db) {
    try {
      // Determine if query is about language or elective
      const queryLower = JSON.stringify(entities).toLowerCase();
      const isLanguage = queryLower.includes('language') || 
                         entities.language ||
                         queryLower.match(/\b(kannada|hindi|sanskrit|tamil)\b/);
      
      const field = isLanguage ? 'languageSubject' : 'electiveSubject';
      const label = isLanguage ? 'Language' : 'Elective';
      
      // Get distribution data with student details
      const distribution = await db.collection('students').aggregate([
        { 
          $match: { 
            [field]: { $ne: "", $ne: null, $exists: true }, 
            isActive: true 
          } 
        },
        { 
          $group: { 
            _id: `$${field}`, 
            count: { $sum: 1 },
            streams: { $addToSet: "$stream" }
          } 
        },
        { $sort: { count: -1 } }
      ]).toArray();
      
      if (distribution.length === 0) {
        return {
          answer: `<h3>${label} Subject Distribution</h3>\n\n<p>No ${label.toLowerCase()} subject data found in the system.</p><p>Students may not have selected their ${label.toLowerCase()} subjects yet.</p>`,
          data: null,
          sources: ['students'],
          mongoQuery: `db.students.aggregate([{$match:{${field}:{$ne:""}}}])`
        };
      }
      
      const total = distribution.reduce((sum, item) => sum + item.count, 0);
      
      // Build comprehensive response
      let answer = `<h3>${label} Subject Distribution</h3>\n\n`;
      answer += `<p><strong>Total students with ${label.toLowerCase()} selected:</strong> ${total}</p>\n\n`;
      
      // Top preferences cards
      answer += `<div class="stat-grid">`;
      distribution.slice(0, 4).forEach((item, idx) => {
        const percentage = ((item.count / total) * 100).toFixed(1);
        answer += `<div class="stat-card">`;
        answer += `<div class="stat-card-title">${item._id}</div>`;
        answer += `<div class="stat-card-value">${item.count}</div>`;
        answer += `<p style="font-size: 12px; color: #64748B; margin-top: 4px;">${percentage}% of students</p>`;
        answer += `</div>`;
      });
      answer += `</div>\n\n`;
      
      // Full distribution table
      answer += `<h4>Complete Distribution</h4>\n`;
      answer += `<table>
  <thead>
  <tr>
  <th>Rank</th>
  <th>${label} Subject</th>
  <th>Students</th>
  <th>Percentage</th>
  <th>Popularity</th>
  <th>Streams</th>
  </tr>
  </thead>
  <tbody>\n`;
      
      distribution.forEach((item, index) => {
        const percentage = ((item.count / total) * 100).toFixed(1);
        const barLength = Math.round(parseFloat(percentage) / 2);
        const bar = '█'.repeat(Math.max(1, barLength));
        
        answer += `<tr>
  <td>${index + 1}</td>
  <td><strong>${item._id}</strong></td>
  <td>${item.count}</td>
  <td><span class="badge ${percentage >= 30 ? 'success' : percentage >= 15 ? 'info' : 'warning'}">${percentage}%</span></td>
  <td style="font-family: monospace; color: #3B82F6;">${bar}</td>
  <td>${item.streams.join(', ')}</td>
  </tr>\n`;
      });
      
      answer += `</tbody>
  </table>\n\n`;
      
      // Insights section
      const mostPopular = distribution[0];
      const leastPopular = distribution[distribution.length - 1];
      
      answer += `<div class="section">`;
      answer += `<h4>Key Insights</h4>`;
      answer += `<div class="info-row">`;
      answer += `<span class="info-label">Most Popular:</span>`;
      answer += `<span class="info-value"><strong>${mostPopular._id}</strong> (${mostPopular.count} students, ${((mostPopular.count / total) * 100).toFixed(1)}%)</span>`;
      answer += `</div>`;
      answer += `<div class="info-row">`;
      answer += `<span class="info-label">Least Popular:</span>`;
      answer += `<span class="info-value"><strong>${leastPopular._id}</strong> (${leastPopular.count} students, ${((leastPopular.count / total) * 100).toFixed(1)}%)</span>`;
      answer += `</div>`;
      answer += `<div class="info-row">`;
      answer += `<span class="info-label">Total Options:</span>`;
      answer += `<span class="info-value">${distribution.length} different ${label.toLowerCase()} subjects</span>`;
      answer += `</div>`;
      
      // Calculate diversity
      const diversity = distribution.length >= 4 ? "High" : distribution.length >= 2 ? "Moderate" : "Low";
      answer += `<div class="info-row">`;
      answer += `<span class="info-label">Choice Diversity:</span>`;
      answer += `<span class="info-value">${diversity}</span>`;
      answer += `</div>`;
      answer += `</div>\n\n`;
      
      // Stream-wise breakdown
      const streamBreakdown = await db.collection('students').aggregate([
        { 
          $match: { 
            [field]: { $ne: "", $ne: null, $exists: true }, 
            isActive: true 
          } 
        },
        { 
          $group: { 
            _id: { stream: "$stream", subject: `$${field}` },
            count: { $sum: 1 }
          } 
        },
        { $sort: { "_id.stream": 1, count: -1 } }
      ]).toArray();
      
      if (streamBreakdown.length > 0) {
        answer += `<h4>Stream-wise Preferences</h4>\n`;
        answer += `<table>
  <thead>
  <tr>
  <th>Stream</th>
  <th>${label} Subject</th>
  <th>Students</th>
  <th>% within Stream</th>
  </tr>
  </thead>
  <tbody>\n`;
        
        // Calculate stream totals
        const streamTotals = {};
        streamBreakdown.forEach(item => {
          if (!streamTotals[item._id.stream]) {
            streamTotals[item._id.stream] = 0;
          }
          streamTotals[item._id.stream] += item.count;
        });
        
        streamBreakdown.forEach(item => {
          const streamPercentage = ((item.count / streamTotals[item._id.stream]) * 100).toFixed(1);
          answer += `<tr>
  <td><strong>${item._id.stream}</strong></td>
  <td>${item._id.subject}</td>
  <td>${item.count}</td>
  <td>${streamPercentage}%</td>
  </tr>\n`;
        });
        
        answer += `</tbody>
  </table>`;
      }
      
      return {
        answer,
        data: { 
          distribution, 
          streamBreakdown,
          type: label.toLowerCase(), 
          total,
          mostPopular: mostPopular._id,
          leastPopular: leastPopular._id
        },
        sources: ['students'],
        mongoQuery: `db.students.aggregate([{$match:{${field}:{$ne:""},isActive:true}},{$group:{_id:"$${field}",count:{$sum:1}}}])`
      };
      
    } catch (error) {
      console.error('Error in getLanguageElectiveAdvanced:', error);
      return {
        answer: "Error fetching language/elective distribution data.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  // ============================================================================
  // INTELLIGENT FALLBACK
  // ============================================================================
  
  async function intelligentFallback(query, db) {
    return await contextualIntelligentSearch(query, db);
  }
  
  // ============================================================================
  // HELP MESSAGE
  // ============================================================================
  
  function getHelpMessage() {
    return {
      answer: `<h3>UniSphere AI Assistant</h3>\n\n<p>I understand natural language! Try:</p>\n\n<h4>Student Queries</h4>\n<ul>\n<li>"PRIYA" or "Find PRIYA"</li>\n<li>"List students in BCA sem 5"</li>\n<li>"How many students in BCOM?"</li>\n<li>"Students who take Hindi"</li>\n</ul>\n\n<h4>Subject Queries</h4>\n<ul>\n<li>"Show subjects for BCA sem 3"</li>\n<li>"Details about Computer Architecture"</li>\n<li>"Who takes Math?"</li>\n</ul>\n\n<h4>Attendance</h4>\n<ul>\n<li>"Attendance for BCA"</li>\n<li>"Analyze attendance trends"</li>\n<li>"Who was absent in Physics?"</li>\n</ul>\n\n<h4>Analytics</h4>\n<ul>\n<li>"Show statistics"</li>\n<li>"Compare BCA and BBA"</li>\n<li>"Attendance analysis"</li>\n</ul>\n\n<p>I'm learning! Ask me anything!</p>`,
      data: null,
      sources: ['AI Assistant'],
      mongoQuery: null
    };
  }
  // ============================================================================
// MISSING FUNCTION STUBS
// ============================================================================

async function viewAttendance(entities, db) {
    return await getAttendanceAdvanced(entities, db);
  }
  
  async function getAttendanceAdvanced(entities, db) {
    try {
      let filter = {};
      
      if (entities.stream) filter.stream = entities.stream;
      if (entities.semester) filter.semester = entities.semester;
      if (entities.subject) filter.subject = new RegExp(entities.subject, 'i');
      
      const records = await db.collection('attendance')
        .find(filter)
        .sort({ date: -1 })
        .limit(20)
        .toArray();
  
      if (records.length === 0) {
        return {
          answer: "No attendance records found.",
          responseType: 'attendance_view',
          data: null,
          sources: ['attendance'],
          mongoQuery: `db.attendance.find(${JSON.stringify(filter)})`
        };
      }
  
      let answer = `<h3>Attendance Records (${records.length})</h3>\n\n`;
      
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>Date</th>\n`;
      answer += `      <th>Subject</th>\n`;
      answer += `      <th>Stream</th>\n`;
      answer += `      <th>Time</th>\n`;
      answer += `      <th>Present</th>\n`;
      answer += `      <th>%</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      
      records.forEach((record) => {
        const percentage = ((record.presentCount / record.totalStudents) * 100).toFixed(1);
        
        answer += `    <tr>\n`;
        answer += `      <td>${new Date(record.date).toLocaleDateString()}</td>\n`;
        answer += `      <td><strong>${record.subject}</strong></td>\n`;
        answer += `      <td>${record.stream} Sem ${record.semester}</td>\n`;
        answer += `      <td>${record.time}</td>\n`;
        answer += `      <td>${record.presentCount}/${record.totalStudents}</td>\n`;
        answer += `      <td>${percentage}%</td>\n`;
        answer += `    </tr>\n`;
      });
      
      answer += `  </tbody>\n`;
      answer += `</table>\n`;
  
      return {
        answer,
        responseType: 'attendance_view',
        data: { records },
        sources: ['attendance'],
        mongoQuery: `db.attendance.find(${JSON.stringify(filter)})`
      };
    } catch (error) {
      return {
        answer: "Error fetching attendance.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  async function compareStreams(entities, db) {
    try {
      const streamStats = await db.collection('students').aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$stream', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
  
      let answer = `<h3>Stream Comparison</h3>\n\n`;
      
      answer += `<table>\n`;
      answer += `  <thead>\n`;
      answer += `    <tr>\n`;
      answer += `      <th>Stream</th>\n`;
      answer += `      <th>Students</th>\n`;
      answer += `      <th>Percentage</th>\n`;
      answer += `    </tr>\n`;
      answer += `  </thead>\n`;
      answer += `  <tbody>\n`;
      
      const total = streamStats.reduce((sum, s) => sum + s.count, 0);
      streamStats.forEach(s => {
        const pct = ((s.count / total) * 100).toFixed(1);
        answer += `    <tr>\n`;
        answer += `      <td><strong>${s._id}</strong></td>\n`;
        answer += `      <td>${s.count}</td>\n`;
        answer += `      <td>${pct}%</td>\n`;
        answer += `    </tr>\n`;
      });
      
      answer += `  </tbody>\n`;
      answer += `</table>\n`;
  
      return {
        answer,
        responseType: 'comparison',
        data: { streamStats },
        sources: ['students'],
        mongoQuery: 'Aggregation query'
      };
    } catch (error) {
      return {
        answer: "Error comparing streams.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  async function getLanguageElectiveInfo(entities, db) {
    try {
      const languageStats = await db.collection('students').aggregate([
        { $match: { isActive: true, languageSubject: { $ne: null, $ne: "" } } },
        { $group: { _id: '$languageSubject', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
  
      const electiveStats = await db.collection('students').aggregate([
        { $match: { isActive: true, electiveSubject: { $ne: null, $ne: "" } } },
        { $group: { _id: '$electiveSubject', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
  
      let answer = `<h3>Language & Elective Distribution</h3>\n\n`;
      
      if (languageStats.length > 0) {
        answer += `<h4>Language Subjects</h4>\n`;
        answer += `<table>\n`;
        answer += `  <thead>\n`;
        answer += `    <tr><th>Language</th><th>Students</th></tr>\n`;
        answer += `  </thead>\n`;
        answer += `  <tbody>\n`;
        
        languageStats.forEach(s => {
          answer += `    <tr>\n`;
          answer += `      <td><strong>${s._id}</strong></td>\n`;
          answer += `      <td>${s.count}</td>\n`;
          answer += `    </tr>\n`;
        });
        
        answer += `  </tbody>\n`;
        answer += `</table>\n\n`;
      }
  
      if (electiveStats.length > 0) {
        answer += `<h4>Elective Subjects</h4>\n`;
        answer += `<table>\n`;
        answer += `  <thead>\n`;
        answer += `    <tr><th>Elective</th><th>Students</th></tr>\n`;
        answer += `  </thead>\n`;
        answer += `  <tbody>\n`;
        
        electiveStats.forEach(s => {
          answer += `    <tr>\n`;
          answer += `      <td><strong>${s._id}</strong></td>\n`;
          answer += `      <td>${s.count}</td>\n`;
          answer += `    </tr>\n`;
        });
        
        answer += `  </tbody>\n`;
        answer += `</table>\n`;
      }
  
      return {
        answer,
        responseType: 'language_elective_info',
        data: { languageStats, electiveStats },
        sources: ['students'],
        mongoQuery: 'Aggregation queries'
      };
    } catch (error) {
      return {
        answer: "Error fetching language/elective info.",
        data: null,
        sources: [],
        mongoQuery: null
      };
    }
  }
  
  async function getSubjectDetails(entities, db) {
    return await getSubjectsAdvanced(entities, db);
  }
  

  
  module.exports = router;
  