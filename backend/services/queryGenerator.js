// ============================================================================
// QUERY GENERATOR - NATURAL INTRO FOR ALL RESPONSES (COMPLETE VERSION)
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-26 19:02:17
// Current User's Login: Itzzsk
// ============================================================================

const geminiService = require('./geminiService');
const { getSchemaContext } = require('../utils/schemaContext');
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');


// ============================================================================
// PARSE DATE FROM QUERY - HANDLES ALL DATE FORMATS
// ============================================================================

function parseDateFromQuery(question) {
  // Match formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, "today", "yesterday"
  const datePatterns = [
    /(\d{2})-(\d{2})-(\d{4})/,  // DD-MM-YYYY
    /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{4})-(\d{2})-(\d{2})/   // YYYY-MM-DD
  ];

  for (const pattern of datePatterns) {
    const match = question.match(pattern);
    if (match) {
      if (pattern === datePatterns[2]) {
        // Already YYYY-MM-DD
        return match[0];
      } else {
        // Convert DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
    }
  }

  // Check for "today"
  if (question.toLowerCase().includes('today')) {
    return new Date().toISOString().split('T')[0];
  }

  // Check for "yesterday"
  if (question.toLowerCase().includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  return null;
}


// ============================================================================
// BUILD STUDENT ATTENDANCE QUERY - PRE-BUILT TEMPLATE
// ============================================================================

function buildStudentAttendanceQuery(studentName, specificDate = null) {
  console.log(`🎯 [Pre-built Query] Student: ${studentName}, Date: ${specificDate || 'all'}`);

  const dateFilter = specificDate
    ? [{ "$regexMatch": { "input": "$date", "regex": `^${specificDate}` } }]
    : [];

  const query = [
    {
      "$match": {
        "name": { "$regex": studentName, "$options": "i" },
        "isActive": true
      }
    },
    {
      "$limit": 1
    },
    {
      "$lookup": {
        "from": "attendance",
        "let": {
          "studentID": "$studentID",
          "stream": "$stream",
          "semester": "$semester"
        },
        "pipeline": [
          {
            "$match": {
              "$expr": {
                "$and": [
                  { "$eq": ["$stream", "$$stream"] },
                  { "$eq": ["$semester", "$$semester"] },
                  ...dateFilter
                ]
              }
            }
          },
          {
            "$group": {
              "_id": "$subject",
              "totalClasses": { "$sum": 1 },
              "attended": {
                "$sum": {
                  "$cond": [
                    { "$in": ["$$studentID", "$studentsPresent"] },
                    1,
                    0
                  ]
                }
              }
            }
          },
          {
            "$project": {
              "subject": "$_id",
              "totalClasses": 1,
              "classesAttended": "$attended",
              "attendancePercentage": {
                "$multiply": [
                  { "$divide": ["$attended", "$totalClasses"] },
                  100
                ]
              },
              "_id": 0
            }
          }
        ],
        "as": "attendance"
      }
    },
    {
      "$unwind": "$attendance"
    },
    {
      "$replaceRoot": {
        "newRoot": {
          "$mergeObjects": [
            "$attendance",
            {
              "studentName": "$name",
              "studentID": "$studentID",
              "stream": "$stream",
              "semester": "$semester"
            }
          ]
        }
      }
    }
  ];

  return {
    collection: "students",
    operation: "aggregate",
    query: query,
    explanation: `Complete attendance report for ${studentName}${specificDate ? ` on ${specificDate}` : ''}`
  };
}


// ============================================================================
// EXECUTE QUERY WITH ENHANCED ERROR HANDLING
// ============================================================================

async function executeQuery(queryInfo) {
  const { collection, operation, query, projection } = queryInfo;

  console.log(`🔍 [Executing] ${operation} on ${collection}`);

  try {
    const db = getDB();
    if (!db) {
      throw new Error('Database not connected');
    }

    const coll = db.collection(collection);
    let results;

    switch (operation) {
      case 'find':
        results = projection
          ? await coll.find(query).project(projection).toArray()
          : await coll.find(query).toArray();
        console.log(`✅ [Results] Found ${results.length} documents`);
        break;

      case 'countDocuments':
        results = await coll.countDocuments(query);
        console.log(`✅ [Results] Count: ${results}`);
        break;

      case 'aggregate':
        results = await coll.aggregate(query).toArray();
        console.log(`✅ [Results] Aggregation returned ${results.length} documents`);

        if (results.length === 0 && collection === 'students') {
          const queryStr = JSON.stringify(query);
          const studentNameMatch = queryStr.match(/"name":\s*\{\s*"\$regex"\s*:\s*"([^"]+)"/);

          if (studentNameMatch) {
            const studentName = studentNameMatch[1];
            console.log(`⚠️ No attendance data found for "${studentName}", checking if student exists...`);

            const studentColl = db.collection('students');
            const studentExists = await studentColl.findOne({
              name: { $regex: studentName, $options: 'i' },
              isActive: true
            });

            if (studentExists) {
              console.log(`✅ Student found: ${studentExists.name} (${studentExists.studentID})`);

              const attendanceColl = db.collection('attendance');
              const attendanceCount = await attendanceColl.countDocuments({
                stream: studentExists.stream,
                semester: studentExists.semester
              });

              if (attendanceCount === 0) {
                throw new Error(`NO_ATTENDANCE_RECORDS:${studentExists.name}:${studentExists.stream}:${studentExists.semester}`);
              } else {
                throw new Error(`STUDENT_EXISTS_NO_ATTENDANCE:${studentExists.name}:${studentExists.stream}:${studentExists.semester}:${studentExists.studentID}`);
              }
            } else {
              console.log(`❌ Student "${studentName}" not found in database`);
              throw new Error(`STUDENT_NOT_FOUND:${studentName}`);
            }
          }
        }
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    return results;

  } catch (error) {
    console.error(`❌ [Query Error]:`, error.message);
    throw error;
  }
}


// ============================================================================
// GENERATE MONGO QUERY - OPTIMIZED WITH PRE-BUILT TEMPLATES
// ============================================================================

async function generateMongoQuery(question) {
  console.log(`📝 [Query Generator] Question: ${question}`);

  const schemaContext = getSchemaContext();

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentDateTime = now.toISOString().replace('T', ' ').substring(0, 19);

  // Parse date if present
  const parsedDate = parseDateFromQuery(question);
  const lowerQuestion = question.toLowerCase();

  // =========== PRE-BUILT TEMPLATE: LOW ATTENDANCE / DEFAULTERS ===========
  if (lowerQuestion.match(/low\s*attendance|below\s*75|less\s*than\s*75|defaulter|shortage|poor\s*attendance|<\s*75/i)) {
    console.log(`🎯 [Quick Match] Low attendance query detected`);

    // Extract stream - look for any 2-4 letter word pattern that could be a stream
    // Common streams: BCA, BBA, BCOM, MCA, MBA, BDA, BSC, BA, etc.
    const streamPatterns = lowerQuestion.match(/\b([a-z]{2,5})\b/gi) || [];
    const knownStreams = ['bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'bsc', 'ba', 'btech', 'mtech', 'msc', 'ma'];
    let detectedStream = null;

    for (const word of streamPatterns) {
      if (knownStreams.includes(word.toLowerCase())) {
        detectedStream = word.toUpperCase();
        break;
      }
    }

    // Also try direct uppercase match in original question
    const directStreamMatch = question.match(/\b(BCA|BBA|BCOM|MCA|MBA|BDA|BSC|BA|BTECH|MTECH|MSC|MA)\b/i);
    if (directStreamMatch) {
      detectedStream = directStreamMatch[1].toUpperCase();
    }

    // Extract semester - multiple patterns
    let detectedSemester = null;
    const semPatterns = [
      /sem(?:ester)?\s*(\d)/i,           // sem 6, semester 6
      /(\d)(?:st|nd|rd|th)?\s*sem/i,     // 6th sem, 6 sem
      /\bsem(\d)\b/i,                     // sem6
      /\bsemester\s*(\d)\b/i              // semester 6
    ];

    for (const pattern of semPatterns) {
      const match = lowerQuestion.match(pattern);
      if (match) {
        detectedSemester = parseInt(match[1]);
        break;
      }
    }

    console.log(`📍 Detected Stream: ${detectedStream || 'ALL'}, Semester: ${detectedSemester || 'ALL'}`);

    const matchFilter = { isActive: true };
    if (detectedStream) matchFilter.stream = detectedStream;
    if (detectedSemester) matchFilter.semester = detectedSemester;

    return {
      collection: "students",
      operation: "aggregate",
      query: [
        { "$match": matchFilter },
        {
          "$lookup": {
            "from": "attendance",
            "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" },
            "pipeline": [
              {
                "$match": {
                  "$expr": {
                    "$and": [
                      { "$eq": ["$stream", "$$stream"] },
                      { "$eq": ["$semester", "$$semester"] }
                    ]
                  }
                }
              },
              {
                "$group": {
                  "_id": null,
                  "totalClasses": { "$sum": 1 },
                  "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } }
                }
              }
            ],
            "as": "stats"
          }
        },
        { "$unwind": { "path": "$stats", "preserveNullAndEmptyArrays": true } },
        {
          "$addFields": {
            "attendancePercentage": {
              "$cond": [
                { "$gt": [{ "$ifNull": ["$stats.totalClasses", 0] }, 0] },
                { "$multiply": [{ "$divide": ["$stats.attended", "$stats.totalClasses"] }, 100] },
                0
              ]
            }
          }
        },
        { "$match": { "attendancePercentage": { "$lt": 75 } } },
        {
          "$project": {
            "name": 1, "studentID": 1, "stream": 1, "semester": 1,
            "attendancePercentage": { "$round": ["$attendancePercentage", 1] },
            "classesAttended": "$stats.attended",
            "totalClasses": "$stats.totalClasses"
          }
        },
        { "$sort": { "attendancePercentage": 1 } }
      ],
      explanation: `Students with attendance below 75%${detectedStream ? ` in ${detectedStream}` : ''}${detectedSemester ? ` Semester ${detectedSemester}` : ''}`
    };
  }

  // =========== PRE-BUILT TEMPLATE: DATE-BASED ATTENDANCE ===========
  if (parsedDate || lowerQuestion.includes('today') || lowerQuestion.includes('yesterday')) {
    const dateToUse = parsedDate || (lowerQuestion.includes('yesterday')
      ? new Date(Date.now() - 86400000).toISOString().split('T')[0]
      : currentDate);

    if (lowerQuestion.match(/attendance|class|session/i)) {
      console.log(`🎯 [Quick Match] Date-based attendance: ${dateToUse}`);

      // Extract stream and semester for filtering
      const streamPatterns = lowerQuestion.match(/\b([a-z]{2,5})\b/gi) || [];
      const knownStreams = ['bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'bsc', 'ba', 'btech', 'mtech', 'msc', 'ma'];
      let detectedStream = null;
      for (const word of streamPatterns) {
        if (knownStreams.includes(word.toLowerCase())) {
          detectedStream = word.toUpperCase();
          break;
        }
      }

      let detectedSemester = null;
      const semPatterns = [/sem(?:ester)?\s*(\d)/i, /(\d)(?:st|nd|rd|th)?\s*sem/i, /\bsem(\d)\b/i];
      for (const pattern of semPatterns) {
        const match = lowerQuestion.match(pattern);
        if (match) { detectedSemester = parseInt(match[1]); break; }
      }

      const query = { "date": { "$regex": `^${dateToUse}` } };
      if (detectedStream) query.stream = detectedStream;
      if (detectedSemester) query.semester = detectedSemester;

      return {
        collection: "attendance",
        operation: "find",
        query: query,
        projection: { "subject": 1, "stream": 1, "semester": 1, "teacherName": 1, "presentCount": 1, "absentCount": 1, "totalStudents": 1, "time": 1, "date": 1 },
        explanation: `Attendance records for ${dateToUse}${detectedStream ? ` in ${detectedStream}` : ''}${detectedSemester ? ` Semester ${detectedSemester}` : ''}`
      };
    }
  }

  // =========== PRE-BUILT TEMPLATE: STUDENT ATTENDANCE REPORT ===========
  // Catch patterns like: "attendance of X", "report for X", "Arvind's attendance", 
  // "how many classes has Arvind attended", "classes attended by Arvind"
  const studentAttendanceRegex = /(?:attendance|report|how\s+many\s+classes|classes(?:\s+attended)?).*?(?:of|for|by|student|has)\s+([^?.]+)|([^?.]+?)(?:'s|s|s')\s+(?:attendance|report|classes)/i;
  const attendanceMatch = lowerQuestion.match(studentAttendanceRegex);

  if (attendanceMatch) {
    let studentName = (attendanceMatch[1] || attendanceMatch[2]).trim();
    // Clean up suffix "attended" if it was captured
    studentName = studentName.replace(/\s+attended$/i, '').trim();
    // Remove common filler words that might be captured at the start
    studentName = studentName.replace(/^(?:student|has|attended)\s+/i, '').trim();

    if (studentName && studentName.length > 2) {
      console.log(`🎯 [Quick Match] Student attendance query for: ${studentName}`);
      return buildStudentAttendanceQuery(studentName, parsedDate);
    }
  }

  // =========== PRE-BUILT TEMPLATE: SUBJECT LISTS ===========
  if (lowerQuestion.match(/subjects|curriculum|syllabus|papers|classes\s+of/i)) {
    console.log(`🎯 [Quick Match] Subject list query detected`);

    // Extract stream
    const streamPatterns = lowerQuestion.match(/\b([a-z]{2,5})\b/gi) || [];
    const knownStreams = ['bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'bsc', 'ba', 'btech', 'mtech', 'msc', 'ma'];
    let detectedStream = null;
    for (const word of streamPatterns) {
      if (knownStreams.includes(word.toLowerCase())) {
        detectedStream = word.toUpperCase();
        break;
      }
    }

    // Extract semester
    let detectedSemester = null;
    const semPatterns = [/sem(?:ester)?\s*(\d)/i, /(\d)(?:st|nd|rd|th)?\s*sem/i, /\bsem(\d)\b/i];
    for (const pattern of semPatterns) {
      const match = lowerQuestion.match(pattern);
      if (match) { detectedSemester = parseInt(match[1]); break; }
    }

    const query = { isActive: true };
    if (detectedStream) query.stream = detectedStream;
    if (detectedSemester) query.semester = detectedSemester;

    return {
      collection: "subjects",
      operation: "find",
      query: query,
      projection: { name: 1, subjectCode: 1, stream: 1, semester: 1, subjectType: 1 },
      explanation: `Subject list for ${detectedStream || 'all streams'}${detectedSemester ? ` Semester ${detectedSemester}` : ''}`
    };
  }

  // =========== PRE-BUILT TEMPLATE: ATTENDANCE SUMMARY ===========
  if (lowerQuestion.match(/attendance\s+summary|overall\s+attendance|attendance\s+overview|attendance\s+stats/i)) {
    console.log(`🎯 [Quick Match] Attendance summary query detected`);

    // Extract stream
    const streamPatterns = lowerQuestion.match(/\b([a-z]{2,5})\b/gi) || [];
    const knownStreams = ['bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'bsc', 'ba', 'btech', 'mtech', 'msc', 'ma'];
    let detectedStream = null;
    for (const word of streamPatterns) {
      if (knownStreams.includes(word.toLowerCase())) {
        detectedStream = word.toUpperCase();
        break;
      }
    }

    // Extract semester
    let detectedSemester = null;
    const semPatterns = [/sem(?:ester)?\s*(\d)/i, /(\d)(?:st|nd|rd|th)?\s*sem/i, /\bsem(\d)\b/i];
    for (const pattern of semPatterns) {
      const match = lowerQuestion.match(pattern);
      if (match) { detectedSemester = parseInt(match[1]); break; }
    }

    // If both stream and semester are detected, show STUDENT + SUBJECT summary
    if (detectedStream && detectedSemester) {
      console.log(`🎯 [Template Override] Student+Subject summary for ${detectedStream} Sem ${detectedSemester}`);
      return {
        collection: "students",
        operation: "aggregate",
        query: [
          { "$match": { "stream": detectedStream, "semester": detectedSemester, "isActive": true } },
          {
            "$lookup": {
              "from": "attendance",
              "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" },
              "pipeline": [
                {
                  "$match": {
                    "$expr": {
                      "$and": [
                        { "$eq": ["$stream", "$$stream"] },
                        { "$eq": ["$semester", "$$semester"] }
                      ]
                    }
                  }
                },
                {
                  "$group": {
                    "_id": "$subject",
                    "totalClasses": { "$sum": 1 },
                    "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } }
                  }
                }
              ],
              "as": "subjectStats"
            }
          },
          { "$unwind": { "path": "$subjectStats", "preserveNullAndEmptyArrays": false } },
          {
            "$addFields": {
              "attendancePercentage": {
                "$cond": [
                  { "$gt": ["$subjectStats.totalClasses", 0] },
                  { "$multiply": [{ "$divide": ["$subjectStats.attended", "$subjectStats.totalClasses"] }, 100] },
                  0
                ]
              }
            }
          },
          {
            "$project": {
              "name": 1,
              "studentID": 1,
              "subject": "$subjectStats._id",
              "attendancePercentage": { "$round": ["$attendancePercentage", 1] },
              "classesAttended": "$subjectStats.attended",
              "totalClasses": "$subjectStats.totalClasses",
              "stream": 1,
              "semester": 1
            }
          },
          { "$sort": { "studentID": 1, "subject": 1 } }
        ],
        explanation: `Detailed student-wise and subject-wise attendance summary for ${detectedStream} Semester ${detectedSemester}`
      };
    }

    const matchStage = {};
    if (detectedStream) matchStage.stream = detectedStream;
    if (detectedSemester) matchStage.semester = detectedSemester;

    return {
      collection: "attendance",
      operation: "aggregate",
      query: [
        { "$match": matchStage },
        {
          "$group": {
            "_id": detectedSemester ? "$subject" : "$semester",
            "totalSessions": { "$sum": 1 },
            "totalPresent": { "$sum": "$presentCount" },
            "totalStudents": { "$sum": "$totalStudents" }
          }
        },
        {
          "$addFields": {
            "avgPercentage": {
              "$cond": [
                { "$gt": ["$totalStudents", 0] },
                { "$round": [{ "$multiply": [{ "$divide": ["$totalPresent", "$totalStudents"] }, 100] }, 1] },
                0
              ]
            }
          }
        },
        { "$sort": { "_id": 1 } }
      ],
      explanation: `${detectedStream || ''} Attendance Summary${detectedSemester ? ` for Semester ${detectedSemester}` : ''}`
    };
  }

  const dateHint = parsedDate ? `\n\nDETECTED DATE: ${parsedDate} (use this exact format in queries)` : '';

  // Simplified prompt for faster response
  const prompt = `${schemaContext}

CURRENT DATE: ${currentDate}
CURRENT DATE TIME (UTC): ${currentDateTime}
CURRENT USER: Itzzsk

USER QUESTION: "${question}"${dateHint}

==============================================================================
SCHEMA REFERENCE:
==============================================================================

**STUDENTS:** studentID, name, stream, semester, parentPhone, languageSubject, electiveSubject, academicYear, isActive
**TEACHERS:** name, email, phone, department, createdSubjects[{subject, stream, semester, subjectCode}]
**SUBJECTS:** name, subjectCode, stream, semester, subjectType (CORE/ELECTIVE), teacherAssigned
**ATTENDANCE:** stream, semester, subject, date (ISO: "YYYY-MM-DDTHH:MM:SS.000Z"), time, studentsPresent[], totalStudents, presentCount, absentCount

==============================================================================
QUERY RULES (SIMPLIFIED):
==============================================================================

1. **Students:** Always include "isActive": true
2. **Text Search:** { "$regex": "text", "$options": "i" }
3. **Date Queries:** { "date": { "$regex": "^YYYY-MM-DD" } } - NO $date operator
4. **Counts:** Use countDocuments
5. **Teachers:** Search createdSubjects.subject for "who teaches"
6. Generate COMPACT queries (avoid overly complex aggregations)

==============================================================================
QUICK EXAMPLES:
==============================================================================

**List Students:**
{"collection":"students","operation":"find","query":{"isActive":true},"explanation":"All students"}

**BCA Sem 5:**
{"collection":"students","operation":"find","query":{"stream":"BCA","semester":5,"isActive":true},"explanation":"BCA Semester 5"}

**Find Teacher:**
{"collection":"teachers","operation":"find","query":{"name":{"$regex":"Smith","$options":"i"}},"explanation":"Teacher Smith"}

**Today Attendance:**
{"collection":"attendance","operation":"find","query":{"date":{"$regex":"^${currentDate}"}},"explanation":"Today's attendance"}

**Date Attendance:**
{"collection":"attendance","operation":"find","query":{"date":{"$regex":"^2025-10-15"}},"explanation":"Oct 15 attendance"}

**Count Students:**
{"collection":"students","operation":"countDocuments","query":{"stream":"BCA","isActive":true},"explanation":"Total BCA students"}

==============================================================================
IMPORTANT:
==============================================================================

- Generate ONLY valid JSON (no markdown, no code blocks)
- Start with { and end with }
- Keep queries COMPACT and SIMPLE
- NO emojis in explanation
- NO $date operator (use $regex for dates)

Generate JSON query:`;

  try {
    const response = await geminiService.generateResponse(prompt);
    console.log(`📦 [Gemini] Response Length: ${response.length} chars`);

    // Robust JSON extraction
    let cleaned = response
      .replace(/```/)
      .replace(/```\s*/g, '')        // FIX: Complete backtick pattern
      .replace(/^[^{]*/, '')         // Remove before first {
      .replace(/[^}]*$/, '')         // Remove after last }
      .trim();


    // Find complete JSON object
    let depth = 0;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          endIdx = i;
          break;
        }
      }
    }

    let jsonMatch = null;
    if (startIdx !== -1 && endIdx !== -1) {
      jsonMatch = cleaned.substring(startIdx, endIdx + 1);
    } else {
      // Fallback regex
      const regexMatch = cleaned.match(/\{[\s\S]*\}/);
      if (regexMatch) jsonMatch = regexMatch[0];
    }

    if (!jsonMatch) {
      console.error('❌ No valid JSON found');
      throw new Error('No valid JSON found in response');
    }

    let parsedQuery;
    try {
      parsedQuery = JSON.parse(jsonMatch);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      // Try to fix trailing commas
      try {
        let fixed = jsonMatch.replace(/,(\s*[}\]])/g, '$1');
        parsedQuery = JSON.parse(fixed);
        console.log('✅ Fixed JSON by removing trailing commas');
      } catch (fixError) {
        throw new Error(`Invalid JSON format: ${parseError.message}`);
      }
    }

    // Validate required fields
    if (!parsedQuery.collection || !parsedQuery.operation) {
      if (parsedQuery.collection !== null) {
        throw new Error('Query missing required fields');
      }
    }

    console.log(`✅ [Parsed Query]:
   Collection: ${parsedQuery.collection}
   Operation: ${parsedQuery.operation}
   Explanation: ${parsedQuery.explanation}`);

    return parsedQuery;

  } catch (error) {
    console.error(`❌ [Query Generation Failed]:`, error.message);
    throw new Error(`Failed to generate query: ${error.message}`);
  }
}


// ============================================================================
// GENERATE ACCURATE NATURAL INTRO - CONTEXT-AWARE
// ============================================================================

function generateNaturalIntro(question, results, collection) {
  const count = Array.isArray(results) ? results.length : (typeof results === 'number' ? results : 1);

  // For students
  if (collection === 'students') {
    if (count === 0) {
      return "I couldn't find any students matching your search criteria. The student might not be registered in the system, or there could be a spelling error in the name.";
    } else if (count === 1) {
      const student = results[0];
      return `I found the student record for ${student.name}. They are currently enrolled in ${student.stream} Semester ${student.semester}${student.academicYear ? ` (${student.academicYear})` : ''}. Here are their complete details:`;
    } else {
      const streams = [...new Set(results.map(s => s.stream))];
      const streamText = streams.length === 1 ? streams[0] : `${streams.length} different streams`;
      return `I found ${count} students in the database${streams.length > 0 ? ` across ${streamText}` : ''}. Here's the complete list with all their information:`;
    }
  }

  // For teachers
  if (collection === 'teachers') {
    if (count === 0) {
      return "I couldn't find any teachers matching your search. Please verify the name spelling or try searching with partial names.";
    } else if (count === 1) {
      const teacher = results[0];
      const subjectCount = teacher.createdSubjects?.length || 0;
      return `I found ${teacher.name}'s profile in the system. They are currently teaching ${subjectCount} subject${subjectCount !== 1 ? 's' : ''}${teacher.department ? ` in the ${teacher.department} department` : ''}. Here's their complete information:`;
    } else {
      const totalSubjects = results.reduce((sum, t) => sum + (t.createdSubjects?.length || 0), 0);
      return `I found ${count} teachers in the faculty database, collectively teaching ${totalSubjects} subjects across various streams. Here's detailed information about each:`;
    }
  }

  // For subjects
  if (collection === 'subjects') {
    if (count === 0) {
      return "I couldn't find any subjects matching your search criteria. Please check the stream name, semester number, or subject type.";
    } else {
      const cores = results.filter(s => s.subjectType === 'CORE').length;
      const electives = results.filter(s => s.subjectType === 'ELECTIVE').length;
      return `I found ${count} subject${count !== 1 ? 's' : ''} in the curriculum${cores > 0 && electives > 0 ? ` (${cores} core and ${electives} elective)` : ''}. Here's the complete breakdown:`;
    }
  }

  // For attendance records
  if (collection === 'attendance') {
    if (count === 0) {
      return "I couldn't find any attendance records matching your criteria. Classes might not have been conducted yet for the specified date or criteria.";
    } else {
      const totalPresent = results.reduce((sum, r) => sum + (r.presentCount || 0), 0);
      const totalStudents = results.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
      const avgPct = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : '0';
      return `I found ${count} attendance session${count !== 1 ? 's' : ''} on record with an average attendance of ${avgPct}%. Here's the detailed breakdown:`;
    }
  }

  // For counts
  if (typeof results === 'number') {
    return `I've counted the total number of ${collection} in the database. The count is ${results}. Here's the summary:`;
  }

  // Default
  return `I retrieved ${count} record${count !== 1 ? 's' : ''} matching your query. Here are the details:`;
}


// ============================================================================
// FORMAT AS TABLE - WITH ACCURATE NATURAL INTRO
// ============================================================================

function formatAsTable(results, collection, question) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  // Get natural intro
  const intro = generateNaturalIntro(question, results, collection);
  let table = `${intro}\n\n`;

  const firstItem = results[0];

  // =========== STUDENT + SUBJECT DETAILED SUMMARY TABLE ===========
  if (firstItem.studentID && firstItem.subject && firstItem.attendancePercentage !== undefined) {
    table = `Detailed attendance summary for ${firstItem.stream || ''} Semester ${firstItem.semester || ''}, sorted by Student ID:\n\n`;
    table += `| # | Student ID | Name | Subject | Attended | Total | Att % | Status |\n`;
    table += `|---|------------|------|---------|----------|-------|-------|--------|\n`;

    results.forEach((row, index) => {
      const id = (row.studentID || '-').substring(0, 14);
      const name = (row.name || '-').substring(0, 20);
      const subject = (row.subject || '-').substring(0, 25);
      const attended = row.classesAttended !== undefined ? row.classesAttended : 0;
      const total = row.totalClasses !== undefined ? row.totalClasses : 0;
      const pct = row.attendancePercentage !== undefined ? row.attendancePercentage.toFixed(1) : '0';
      const status = parseFloat(pct) >= 75 ? '✓ Good' : '⚠ Low';

      table += `| ${index + 1} | ${id} | ${name} | ${subject} | ${attended} | ${total} | ${pct}% | ${status} |\n`;
    });

    return table;
  }

  // =========== LOW ATTENDANCE / DEFAULTERS TABLE ===========
  if (firstItem.attendancePercentage !== undefined && firstItem.studentID) {
    table = `I found ${results.length} student${results.length !== 1 ? 's' : ''} with attendance below 75%. Here's the complete list sorted by attendance percentage:\n\n`;
    table += `| # | Student ID | Name | Stream | Sem | Attendance % | Classes | Status |\n`;
    table += `|---|------------|------|--------|-----|--------------|---------|--------|\n`;

    results.slice(0, 100).forEach((student, index) => {
      const id = (student.studentID || '-').substring(0, 14);
      const name = (student.name || '-').substring(0, 20);
      const stream = student.stream || '-';
      const sem = student.semester || '-';
      const pct = student.attendancePercentage !== undefined ? student.attendancePercentage.toFixed(1) : '0';
      const classes = student.classesAttended !== undefined && student.totalClasses !== undefined
        ? `${student.classesAttended}/${student.totalClasses}`
        : '-';
      const status = parseFloat(pct) < 50 ? '⚠ Critical' : '⚠ Low';

      table += `| ${index + 1} | ${id} | ${name} | ${stream} | ${sem} | ${pct}% | ${classes} | ${status} |\n`;
    });

    if (results.length > 100) {
      table += `\n*+${results.length - 100} more students*\n`;
    }

    const critical = results.filter(s => s.attendancePercentage < 50).length;
    const low = results.filter(s => s.attendancePercentage >= 50 && s.attendancePercentage < 75).length;

    table += `\n**Summary:** ${results.length} defaulters total | **Critical (<50%):** ${critical} | **Low (50-75%):** ${low}\n`;
    table += `\n⚠ These students need immediate attention to meet the 75% attendance requirement.\n`;

    return table;
  }

  // Student table (regular)
  if (collection === 'students' || (firstItem.studentID && firstItem.name && !firstItem.email)) {
    table += `| # | ID | Name | Stream | Sem | Phone | Lang | Elective | Year |\n`;
    table += `|---|----|----|--------|-----|-------|------|----------|------|\n`;

    results.slice(0, 100).forEach((student, index) => {
      const id = (student.studentID || '-').substring(0, 12);
      const name = (student.name || '-').substring(0, 18);
      const stream = student.stream || '-';
      const sem = student.semester || '-';
      const phone = (student.parentPhone && student.parentPhone.trim() !== '') ? student.parentPhone : '-';
      const lang = (student.languageSubject && student.languageSubject.trim() !== '') ? student.languageSubject.substring(0, 8) : '-';
      const elec = (student.electiveSubject && student.electiveSubject.trim() !== '') ? student.electiveSubject.substring(0, 10) : '-';
      const year = student.academicYear || '-';

      table += `| ${index + 1} | ${id} | ${name} | ${stream} | ${sem} | ${phone} | ${lang} | ${elec} | ${year} |\n`;
    });

    if (results.length > 100) {
      table += `\n*+${results.length - 100} more students*\n`;
    }

    // Accurate summary
    table += `\n**Total Students:** ${results.length}`;

    const streamCounts = {};
    results.forEach(s => {
      const stream = s.stream || 'Unknown';
      streamCounts[stream] = (streamCounts[stream] || 0) + 1;
    });

    table += ` | **Distribution:** ${Object.entries(streamCounts).map(([k, v]) => `${k} (${v})`).join(', ')}\n`;

    return table;
  }

  // Subject table
  if (collection === 'subjects' || (firstItem.name && firstItem.subjectCode)) {
    table += `| # | Subject | Code | Stream | Sem | Type |\n`;
    table += `|---|---------|------|--------|-----|------|\n`;

    results.slice(0, 100).forEach((subject, index) => {
      const name = (subject.name || '-').substring(0, 25);
      const code = (subject.subjectCode || '-').substring(0, 10);
      const stream = subject.stream || '-';
      const sem = subject.semester || '-';
      const type = subject.subjectType === 'CORE' ? 'Core' : subject.subjectType === 'ELECTIVE' ? 'Elec' : '-';

      table += `| ${index + 1} | ${name} | ${code} | ${stream} | ${sem} | ${type} |\n`;
    });

    if (results.length > 100) {
      table += `\n*+${results.length - 100} more subjects*\n`;
    }

    const typeCounts = { CORE: 0, ELECTIVE: 0 };
    results.forEach(s => {
      if (s.subjectType === 'CORE') typeCounts.CORE++;
      else if (s.subjectType === 'ELECTIVE') typeCounts.ELECTIVE++;
    });

    table += `\n**Total:** ${results.length} subjects | **Core:** ${typeCounts.CORE} | **Elective:** ${typeCounts.ELECTIVE}\n`;

    return table;
  }

  // Attendance table
  if (collection === 'attendance' || (firstItem.subject && firstItem.date)) {
    // =========== ATTENDANCE SUMMARY TABLE (STATS OVERVIEW) ===========
    if (firstItem.avgPercentage !== undefined && firstItem.totalSessions !== undefined) {
      const isSemBreakdown = typeof firstItem._id === 'number';
      table = `### Attendance Overview\n\n`;
      table += `| # | ${isSemBreakdown ? 'Semester' : 'Subject'} | Sessions | Present | Students | Avg Att% | Status |\n`;
      table += `|---|----------|----------|---------|----------|----------|--------|\n`;

      results.forEach((stat, index) => {
        const label = stat._id || '-';
        const sessions = stat.totalSessions || 0;
        const present = stat.totalPresent || 0;
        const total = stat.totalStudents || 0;
        const pct = stat.avgPercentage !== undefined ? stat.avgPercentage.toFixed(1) : '0';
        const status = parseFloat(pct) >= 75 ? '✓ Good' : '⚠ Low';

        table += `| ${index + 1} | ${label} | ${sessions} | ${present} | ${total} | ${pct}% | ${status} |\n`;
      });

      const grandTotalPresent = results.reduce((sum, r) => sum + (r.totalPresent || 0), 0);
      const grandTotalStudents = results.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
      const grandTotalSessions = results.reduce((sum, r) => sum + (r.totalSessions || 0), 0);
      const weightedAvg = grandTotalStudents > 0 ? ((grandTotalPresent / grandTotalStudents) * 100).toFixed(1) : '0';

      table += `\n**Total Over All:** ${grandTotalSessions} sessions | **Overall Presence:** ${grandTotalPresent}/${grandTotalStudents} | **Average:** ${weightedAvg}%\n`;

      return table;
    }

    // Regular attendance records table
    table += `| # | Subject | Stream | Sem | Date | Present | Absent | Att% |\n`;
    table += `|---|---------|--------|-----|------|---------|--------|------|\n`;

    results.slice(0, 100).forEach((att, index) => {
      const subject = (att.subject || '-').substring(0, 22);
      const stream = att.stream || '-';
      const sem = att.semester || '-';
      const date = att.date ? new Date(att.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
      const present = att.presentCount !== undefined ? att.presentCount : '-';
      const absent = att.absentCount !== undefined ? att.absentCount : (att.totalStudents - att.presentCount || '-');
      const pct = att.totalStudents > 0 ? ((att.presentCount / att.totalStudents) * 100).toFixed(1) : '0';

      table += `| ${index + 1} | ${subject} | ${stream} | ${sem} | ${date} | ${present} | ${absent} | ${pct}% |\n`;
    });

    if (results.length > 100) {
      table += `\n*+${results.length - 100} more records*\n`;
    }

    const totalPresent = results.reduce((sum, r) => sum + (r.presentCount || 0), 0);
    const totalStudents = results.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
    const avgPct = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : '0';

    table += `\n**Total Sessions:** ${results.length} | **Average Attendance:** ${avgPct}% | **Total Present:** ${totalPresent}/${totalStudents}\n`;

    return table;
  }

  return null;
}


// ============================================================================
// GENERATE FINAL NATURAL RESPONSE - ACCURATE WITH INTRO
// ============================================================================

async function generateNaturalResponse(question, results, queryInfo) {
  console.log(`📝 [Natural Response] Processing...`);

  // Handle greetings or null collection
  if (!queryInfo.collection || queryInfo.collection === null) {
    return queryInfo.explanation || "Hello! I'm here to help you with student records, attendance tracking, subject information, and teacher profiles. What would you like to know?";
  }

  // For count operations - add accurate natural intro
  if (queryInfo.operation === 'countDocuments') {
    const intro = generateNaturalIntro(question, results, queryInfo.collection);
    return `${intro}\n\n## Total Count: **${results}**\n\nThis represents the total number of ${queryInfo.collection} records matching your search criteria in the database.`;
  }

  // For teachers, ALWAYS use AI-generated with intro
  if (queryInfo.collection === 'teachers') {
    console.log(`👨‍🏫 Using AI-generated natural language for teachers`);
    return await generateAIResponse(question, results, queryInfo);
  }

  // Try table formatting with intro
  const tableFormat = formatAsTable(results, queryInfo.collection, question);
  if (tableFormat) {
    console.log(`✅ Using table format response with natural intro`);
    return tableFormat;
  }

  // Fallback to AI generation
  console.log(`⚠️ Using AI generation fallback`);
  return await generateAIResponse(question, results, queryInfo);
}


// ============================================================================
// AI-GENERATED RESPONSE - ALWAYS WITH ACCURATE INTRO
// ============================================================================

async function generateAIResponse(question, results, queryInfo) {
  const now = new Date();
  const currentDateTime = now.toISOString().replace('T', ' ').substring(0, 19);

  const resultsPreview = Array.isArray(results)
    ? results.slice(0, 10)
    : results;

  const prompt = `You are a friendly and accurate college AI assistant. Generate a natural, conversational response with precise information.

CURRENT DATE TIME: ${currentDateTime}

USER ASKED: "${question}"
COLLECTION: ${queryInfo.collection}
RESULT COUNT: ${Array.isArray(results) ? results.length : 1}
RESULTS: ${JSON.stringify(resultsPreview, null, 2)}

CRITICAL REQUIREMENTS:
1. Start with 2-3 lines of natural, accurate introduction
2. Include specific numbers, names, and details in the intro
3. Then show structured data clearly

RESPONSE FORMAT:

**Intro Examples:**
• "I found ${Array.isArray(results) ? results.length : 1} teacher${Array.isArray(results) && results.length !== 1 ? 's' : ''} in the system..."
• "I retrieved the profile for [Name]. They teach [X] subjects across [streams]..."
• "I found [X] students in [Stream] Semester [Y]. Here's their information..."

**Structured Data:**
- Use ## for main headings, ### for subheadings
- Use **bold** for field names
- Use • for lists
- Use → for relationships
- Show all available info (email, phone, subjects, etc.)

ACCURACY RULES:
- Use exact numbers from data
- Include specific names and details
- Format dates as "Oct 26, 2025"
- Say "Not provided" for empty fields
- NO EMOJIS, use: ✓ ✗ → • ▪

Generate accurate, helpful response:`;

  try {
    const response = await geminiService.generateResponse(prompt);
    return response.trim();
  } catch (error) {
    console.error('⚠️ AI generation failed:', error);
    return friendlyFormatResults(results, question, queryInfo.collection);
  }
}


// ============================================================================
// FALLBACK FORMATTING - ACCURATE WITH INTRO
// ============================================================================

function friendlyFormatResults(results, question, collection) {
  if (!results) {
    return "I couldn't find any data matching your query in the database. This could be because:\n• The record doesn't exist\n• There's a spelling error\n• The search criteria is too specific\n\nPlease try again with different search terms.";
  }

  if (typeof results === 'number') {
    const intro = generateNaturalIntro(question, results, collection);
    return `${intro}\n\n## Total Count: **${results}**\n\nThis is the exact number of ${collection} records in the database matching your criteria.`;
  }

  if (Array.isArray(results)) {
    if (results.length === 0) {
      return "I searched the database but couldn't find any records matching your criteria. Please check:\n• Spelling of names\n• Stream or semester numbers\n• Date formats\n\n**Example queries:**\n• \"List all BCA students\"\n• \"Show teachers in Computer Science\"\n• \"Attendance for today\"";
    }

    const intro = generateNaturalIntro(question, results, collection);
    const tableFormat = formatAsTable(results, collection, question);
    if (tableFormat) {
      return tableFormat;
    }

    let formatted = `${intro}\n\n`;

    const firstItem = results[0];

    if (firstItem.name && firstItem.email) {
      // Teachers - natural language format
      results.slice(0, 10).forEach((teacher, i) => {
        formatted += `### ${i + 1}. ${teacher.name}\n\n`;
        formatted += `**Email:** ${teacher.email}\n`;

        if (teacher.phone) {
          formatted += `**Phone:** ${teacher.phone}\n`;
        }

        if (teacher.department) {
          formatted += `**Department:** ${teacher.department}\n`;
        }

        if (teacher.createdSubjects && teacher.createdSubjects.length > 0) {
          formatted += `\n**Teaching ${teacher.createdSubjects.length} Subject${teacher.createdSubjects.length !== 1 ? 's' : ''}:**\n\n`;
          teacher.createdSubjects.slice(0, 5).forEach((subj) => {
            formatted += `• ${subj.subject}`;
            if (subj.subjectCode) formatted += ` (${subj.subjectCode})`;
            formatted += ` - ${subj.stream} Semester ${subj.semester}\n`;
          });
          if (teacher.createdSubjects.length > 5) {
            formatted += `• ... and ${teacher.createdSubjects.length - 5} more subjects\n`;
          }
        } else {
          formatted += `\n**Subjects:** No teaching assignments currently\n`;
        }

        formatted += `\n`;
      });

      if (results.length > 10) {
        formatted += `\n*Showing first 10 of ${results.length} teachers. +${results.length - 10} more available.*\n`;
      }
    } else {
      formatted += results.slice(0, 10).map((item, i) =>
        `${i + 1}. ${JSON.stringify(item).substring(0, 80)}...`
      ).join('\n\n');

      if (results.length > 10) {
        formatted += `\n\n*+${results.length - 10} more records available*`;
      }
    }

    return formatted;
  }

  return `I found the information you requested. Here are the exact details from the database:\n\n${JSON.stringify(results, null, 2)}`;
}


// ============================================================================
// FORMAT ATTENDANCE REPORT - ACCURATE WITH NATURAL INTRO
// ============================================================================

function formatAttendanceReport(data) {
  if (!data || data.length === 0) {
    return "I couldn't find any attendance records for this student in the database. This could mean:\n• The student hasn't attended any classes yet\n• No classes have been held for their stream/semester\n• The student name is misspelled\n\nPlease verify the student details and try again.";
  }

  const student = data[0];

  // Calculate accurate statistics
  const totalClasses = data.reduce((sum, s) => sum + (s.totalClasses || 0), 0);
  const totalAttended = data.reduce((sum, s) => sum + (s.classesAttended || 0), 0);
  const totalAbsent = totalClasses - totalAttended;
  const overallPct = totalClasses > 0 ? ((totalAttended / totalClasses) * 100).toFixed(1) : '0';

  // Accurate natural intro
  let response = `I found the complete attendance report for ${student.studentName} (${student.studentID}). Out of ${totalClasses} total classes, they have attended ${totalAttended} and missed ${totalAbsent}, giving them an overall attendance of ${overallPct}%. Here's the detailed subject-wise breakdown:\n\n`;

  // Header
  response += `# Attendance Report → ${student.studentName}\n\n`;
  response += `**Student ID:** ${student.studentID} | **Stream:** ${student.stream} | **Semester:** ${student.semester}\n\n`;
  response += `---\n\n`;

  // Accurate Summary
  response += `## Overall Summary\n\n`;
  response += `**Total Classes Held:** ${totalClasses} | **Classes Attended:** ${totalAttended} | **Classes Missed:** ${totalAbsent} | **Overall Percentage:** ${overallPct}%\n\n`;

  // Subject-wise breakdown
  response += `## Subject-wise Breakdown\n\n`;
  response += `| Subject | Attended / Total | Percentage | Status |\n`;
  response += `|---------|------------------|------------|--------|\n`;

  data.forEach(subject => {
    const pct = (subject.attendancePercentage || 0).toFixed(1);
    const status = pct >= 75 ? '✓ Good' : '⚠ Low';
    const subj = (subject.subject || '').substring(0, 30);
    response += `| ${subj} | ${subject.classesAttended} / ${subject.totalClasses} | ${pct}% | ${status} |\n`;
  });

  response += `\n\n`;

  // Accurate shortage analysis
  const shortages = data.filter(s => (s.attendancePercentage || 0) < 75);

  if (shortages.length > 0) {
    response += `## ⚠ Attendance Alert\n\n`;
    response += `${shortages.length} subject${shortages.length !== 1 ? 's' : ''} ${shortages.length !== 1 ? 'are' : 'is'} below the 75% attendance requirement:\n\n`;

    shortages.forEach(s => {
      const needed = Math.max(0, Math.ceil((75 * s.totalClasses - 100 * s.classesAttended) / 25));
      const pct = s.attendancePercentage.toFixed(1);
      const absent = s.totalClasses - s.classesAttended;

      response += `**${s.subject}**\n`;
      response += `• Current Attendance: ${pct}% (${s.classesAttended} out of ${s.totalClasses} classes)\n`;
      response += `• Classes Missed: ${absent}\n`;
      response += `• Classes Needed: ${needed} consecutive ${needed === 1 ? 'class' : 'classes'} to reach 75%\n`;
      response += `• Deficit: ${(75 - pct).toFixed(1)}% below requirement\n\n`;
    });
  } else if (totalClasses > 0) {
    response += `## ✓ Excellent Standing\n\n`;
    response += `All ${data.length} subjects have attendance ≥ 75%. Great work!\n\n`;

    response += `**Subject Details:**\n\n`;
    data.forEach(s => {
      const pct = s.attendancePercentage.toFixed(1);
      const margin = (pct - 75).toFixed(1);
      response += `• **${s.subject}:** ${pct}% (${s.classesAttended}/${s.totalClasses}) - ${margin}% above requirement\n`;
    });
  }

  response += `\n\n\n\n`;

  return response;
}


// ============================================================================
// GET CURRENT DATE TIME
// ============================================================================

function getCurrentDateTime() {
  const now = new Date();
  return {
    date: now.toISOString().split('T')[0],
    dateTime: now.toISOString().replace('T', ' ').substring(0, 19),
    formatted: now.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '')
  };
}


// ============================================================================
// MAIN HANDLER - ORCHESTRATES ENTIRE FLOW
// ============================================================================

async function handleLLMChat(message, userId = 'anonymous') {
  const startTime = Date.now();

  console.log(`\n${'█'.repeat(70)}`);
  console.log(`█ 🚀 LLM CHAT REQUEST - ${new Date().toISOString()}`);
  console.log(`█ User: ${userId}`);
  console.log(`█ Message: "${message}"`);
  console.log(`${'█'.repeat(70)}\n`);

  try {
    // Step 1: Generate MongoDB query
    const queryInfo = await generateMongoQuery(message);

    // Step 2: Execute query
    const results = await executeQuery(queryInfo);

    // Step 3: Check if it's attendance data - use special formatter
    let response;
    if (queryInfo.collection === 'students' &&
      queryInfo.operation === 'aggregate' &&
      Array.isArray(results) &&
      results.length > 0 &&
      results[0].attendancePercentage) {
      response = formatAttendanceReport(results);
    } else {
      // Step 3: Generate natural response
      response = await generateNaturalResponse(message, results, queryInfo);
    }

    const duration = Date.now() - startTime;

    console.log(`${'█'.repeat(70)}`);
    console.log(`█ ✅ CHAT COMPLETED - ${duration}ms`);
    console.log(`${'█'.repeat(70)}\n`);

    return {
      success: true,
      response,
      metadata: {
        collection: queryInfo.collection,
        operation: queryInfo.operation,
        resultCount: Array.isArray(results) ? results.length : (typeof results === 'number' ? results : 1),
        processingTime: `${duration}ms`,
        timestamp: new Date(),
        userId
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.log(`${'█'.repeat(70)}`);
    console.log(`█ ❌ CHAT FAILED - ${duration}ms`);
    console.log(`█ Error: ${error.message}`);
    console.log(`${'█'.repeat(70)}\n`);

    // Parse error message for specific cases
    const errorMsg = error.message;

    if (errorMsg.startsWith('STUDENT_NOT_FOUND:')) {
      const studentName = errorMsg.split(':')[1];
      return {
        success: false,
        error: `Student "${studentName}" not found`,
        suggestion: `The student "${studentName}" is not registered in the system. Please check the spelling and try again.`,
        timestamp: new Date(),
        userId
      };
    }

    if (errorMsg.startsWith('NO_ATTENDANCE_RECORDS:')) {
      const parts = errorMsg.split(':');
      const studentName = parts[1];
      const stream = parts[2];
      const semester = parts[3];
      return {
        success: false,
        error: `No attendance records found`,
        suggestion: `${studentName} is enrolled in ${stream} Semester ${semester}, but no attendance records exist for this stream/semester combination yet. Classes may not have been conducted.`,
        timestamp: new Date(),
        userId
      };
    }

    if (errorMsg.startsWith('STUDENT_EXISTS_NO_ATTENDANCE:')) {
      const parts = errorMsg.split(':');
      const studentName = parts[1];
      const stream = parts[2];
      const semester = parts[3];
      const studentID = parts[4];
      return {
        success: false,
        error: `No attendance data`,
        suggestion: `${studentName} (${studentID}) is registered in ${stream} Semester ${semester}, but they have not attended any classes yet or the attendance hasn't been recorded.`,
        timestamp: new Date(),
        userId
      };
    }

    return {
      success: false,
      error: error.message,
      suggestion: 'Please rephrase your question or try a simpler query',
      timestamp: new Date(),
      userId
    };
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateMongoQuery,
  executeQuery,
  generateNaturalResponse,
  friendlyFormatResults,
  formatAttendanceReport,
  formatAsTable,
  getCurrentDateTime,
  parseDateFromQuery,
  buildStudentAttendanceQuery,
  handleLLMChat,
  generateNaturalIntro,
  generateAIResponse
};
