// ============================================================================
// CHATBOT ROUTES - FULL UPDATED VERSION WITH GROQ + INTENT CLASSIFICATION
// ============================================================================

const express = require('express');
const router = express.Router();
const queryGenerator = require('../services/queryGenerator');
const aiService = require('../services/aiService');
const firebaseAuth = require('../middleware/firebaseAuth');

// ============================================================================
// CHAT ENDPOINT
// ============================================================================

router.post('/chat', firebaseAuth, async (req, res) => {
  try {
    const { message, question, history } = req.body;
    const userQuery = message || question;
    const conversationHistory = Array.isArray(history) ? history : [];

    if (!userQuery || !userQuery.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`💬 USER: "${userQuery}"`);
    console.log(`📚 HISTORY: ${conversationHistory.length} messages`);
    console.log(`${'='.repeat(60)}`);

    const lowerQuery = userQuery.toLowerCase().trim();

    // ================================================================
    // STATIC QUICK RESPONSES - No API call needed
    // ================================================================

    const greetings = ['hi', 'hello', 'hey', 'hii', 'hiii', 'good morning', 'good afternoon', 'good evening', 'namaste', 'yo', 'sup', 'howdy'];
    if (greetings.includes(lowerQuery) || greetings.some(g => lowerQuery === g + '!' || lowerQuery === g + '.')) {
      return res.json({
        success: true,
        answer: "Hello! I'm SAAME, the academic assistant for MLA Academy.\n\nI can help you with:\n\n- **Student search** — Find by name, ID, or stream\n- **Attendance reports** — Per subject breakdown\n- **Teacher info** — Details, subjects, mentees\n- **Analytics** — Top performers, defaulters, comparisons\n- **Academic policies** — Attendance rules, NAAC info\n\nWhat would you like to know?",
        queryInfo: { collection: null, operation: null, explanation: 'Greeting' },
        suggestions: ['List all students', 'Show defaulters', 'Today\'s attendance'],
        resultCount: 0
      });
    }

    const thankPatterns = ['thank', 'thanks', 'thank you', 'thankyou', 'thx', 'ty', 'great', 'awesome', 'perfect', 'got it', 'understood', 'cool', 'nice'];
    if (thankPatterns.some(p => lowerQuery === p || lowerQuery === p + '!' || lowerQuery === p + '.')) {
      return res.json({
        success: true,
        answer: "You're welcome! Feel free to ask anything else about students, attendance, teachers, or academic policies.",
        queryInfo: { collection: null, operation: null, explanation: 'Thanks response' },
        resultCount: 0
      });
    }

    const goodbyePatterns = ['bye', 'goodbye', 'good bye', 'see you', 'see ya', 'later', 'cya', 'take care'];
    if (goodbyePatterns.some(p => lowerQuery === p || lowerQuery === p + '!' || lowerQuery === p + '.')) {
      return res.json({
        success: true,
        answer: "Goodbye! Have a great day. Come back anytime you need academic information.",
        queryInfo: { collection: null, operation: null, explanation: 'Goodbye' },
        resultCount: 0
      });
    }

    const helpPatterns = ['help', 'help me', 'what can you do', 'what do you do', 'how to use', 'commands', 'features'];
    if (helpPatterns.some(p => lowerQuery === p || lowerQuery === p + '?' || lowerQuery === p + '!')) {
      return res.json({
        success: true,
        answer: `## What I Can Help With\n\n### Student Queries\n- "Find student Amrutha"\n- "List BCA semester 5 students"\n- "How many students in BBA?"\n\n### Attendance\n- "Amrutha's attendance"\n- "Today's classes"\n- "Who was absent on 15-01-2026?"\n- "Students with low attendance"\n- "Top 10 performers"\n\n### Teachers & Subjects\n- "List all teachers"\n- "Who teaches Computer Science?"\n- "BCA semester 5 subjects"\n- "Who is the mentor for Amrutha?"\n\n### Analytics\n- "Most attended subjects"\n- "Students with 100% attendance"\n- "Compare Amrutha with class average"\n\n### Academic Policies\n- "What is the attendance rule?"\n- "What is NAAC?"\n- "How does condonation work?"`,
        queryInfo: { collection: null, operation: null, explanation: 'Help response' },
        resultCount: 0
      });
    }

    // ================================================================
    // NUMERIC SELECTION — User types "1", "2" to pick from results
    // ================================================================

    const numericPick = lowerQuery.match(/^(\d{1,2})\.?$/);
    if (numericPick && conversationHistory.length > 0) {
      const selectedNum = parseInt(numericPick[1]);
      const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant');

      if (lastAssistantMsg?.content) {
        // Parse Markdown table rows to extract names
        const tableRows = lastAssistantMsg.content.split('\n');
        const entries = [];

        for (const row of tableRows) {
          const cells = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
          if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
            const rowNum = parseInt(cells[0]);
            let name;
            // Student tables: | # | ID | NAME | ...  (ID is alphanumeric 8+ chars)
            // Teacher tables: | # | NAME | EMAIL | ...
            if (/^[A-Z0-9]{8,}$/i.test(cells[1])) {
              name = cells[2]; // skip ID column
            } else {
              name = cells[1]; // name is second column
            }
            name = name.replace(/\*\*/g, '').trim();
            if (rowNum > 0 && name.length > 2) {
              entries.push({ num: rowNum, name });
            }
          }
        }

        const selected = entries.find(e => e.num === selectedNum);
        if (selected) {
          console.log(`🔢 [Pick] #${selectedNum} → "${selected.name}" → attendance report`);

          try {
            const queryInfo = queryGenerator.buildStudentAttendanceQuery(selected.name);
            const queryResults = await queryGenerator.executeQuery(queryInfo);

            let answer;
            if (queryResults && Array.isArray(queryResults) && queryResults.length > 0) {
              answer = queryGenerator.formatAttendanceReport(queryResults);
            } else {
              // Student found but no attendance — try showing basic info
              const { getDB } = require('../config/database');
              const db = getDB();
              const words = selected.name.split(/\s+/).filter(w => w.length > 0);
              const nameRegex = words.length > 1
                ? words.map(w => `(?=.*${w})`).join('')
                : selected.name;
              const studentInfo = await db.collection('students').findOne({
                name: { $regex: nameRegex, $options: 'i' }, isActive: true
              });

              if (studentInfo) {
                answer = `## ${studentInfo.name}\n\n**ID:** ${studentInfo.studentID} | **Stream:** ${studentInfo.stream} | **Semester:** ${studentInfo.semester}\n\nNo attendance records found for this student yet.`;
              } else {
                answer = `## ${selected.name}\n\nNo attendance records found for this student.`;
              }
            }

            return res.json({
              success: true,
              answer,
              queryInfo: {
                collection: 'students',
                operation: 'aggregate',
                explanation: `Attendance for ${selected.name}`
              },
              resultCount: queryResults?.length || 0
            });
          } catch (pickErr) {
            console.error('🔢 Numeric pick error:', pickErr.message);
            // Fall through to normal flow
          }
        }
      }
    }

    // ================================================================
    // STEP 1: INTENT CLASSIFICATION
    // General question → Groq with college knowledge base
    // DB question → MongoDB pipeline
    // ================================================================

    const intent = await aiService.classifyIntentWithAI(userQuery);
    console.log(`🎯 INTENT: ${intent}`);

    if (intent === 'general') {
      console.log(`📚 General question — answering from knowledge base`);
      try {
        const generalAnswer = await aiService.answerGeneralQuestion(userQuery, conversationHistory);
        return res.json({
          success: true,
          answer: generalAnswer,
          queryInfo: { collection: null, operation: null, explanation: 'General knowledge response' },
          resultCount: 0
        });
      } catch (generalErr) {
        console.error('General question handler failed:', generalErr.message);
        return res.json({
          success: true,
          answer: "I'm not sure about that. For academic policies and procedures, please check with the administration. For student or attendance data, try asking a specific query like 'show BCA students' or 'show attendance for today'.",
          queryInfo: { collection: null, operation: null, explanation: 'General fallback' },
          resultCount: 0
        });
      }
    }

    // ================================================================
    // STEP 2: RESOLVE FOLLOW-UPS & PRONOUNS
    // ================================================================

    let resolvedQuery = userQuery;

    if (conversationHistory.length > 0) {
      let lastPersonName = null;
      let lastPersonType = null;

      // Extract last discussed person from assistant messages
      const assistantMsgs = conversationHistory.filter(m => m.role === 'assistant');
      if (assistantMsgs.length > 0) {
        const namePatterns = [
          /^##\s+(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?$/m,
          /Name:\s*(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?(?:\n|$)/i,
          /Student:\s*(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?(?:\n|$)/i,
          /(?:student\s+(?:record\s+)?(?:for|named?|is)\s*)(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?(?=\.|,|\n| The| the| They| they|$)/i,
          /found\s+(?:the\s+)?(?:student\s+)?(?:record\s+for\s+)?(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?(?=\.|,|\n|$)/i,
          /^(?:\*\*)?([a-zA-Z][a-zA-Z.\s]+?)(?:\*\*)?(?:\s+(?:is a|is an|teaches|is currently|is enrolled|has an?))/im,
          /\*\*([a-zA-Z][a-zA-Z.\s]+?)\*\*/,
        ];

        const skipWords = ['the', 'here', 'this', 'however', 'based', 'unfortunately', 'overall', 'dear', 'please', 'today', 'since', 'smart', 'error', 'student', 'teacher', 'mla', 'academy', 'i', 'as', 'there', 'no', 'what', 'error:', 'found', 'hello', 'attendance', 'subjects', 'email', 'id', 'stream', 'semester', 'name'];

        for (let i = assistantMsgs.length - 1; i >= Math.max(0, assistantMsgs.length - 3); i--) {
          const replyText = assistantMsgs[i].content || '';
          let foundInMsg = false;

          for (const p of namePatterns) {
            const m = replyText.match(p);
            if (m && m[1] && m[1].trim().length > 2 && !skipWords.includes(m[1].split(/[\s.]/)[0].toLowerCase())) {
              lastPersonName = m[1].trim();
              const lowerReply = replyText.toLowerCase();
              lastPersonType = (lowerReply.includes('teacher') ||
                lowerReply.includes('teaches') ||
                lowerReply.includes('faculty') ||
                lowerReply.includes('email:') ||
                lowerReply.includes('subjects (')) ? 'teacher' : 'student';
              foundInMsg = true;
              break;
            }
          }
          if (foundInMsg) break;
        }
      }

      // Also check user's recent messages
      if (!lastPersonName) {
        const userMsgs = conversationHistory.filter(m => m.role === 'user');
        if (userMsgs.length > 0) {
          const lastUserQ = userMsgs[userMsgs.length - 1].content || '';
          const whoMatch = lastUserQ.match(/(?:who\s+is|find|show|about)\s+(\w+(?:\s+\w+)?)/i);
          if (whoMatch && whoMatch[1].length > 2) {
            lastPersonName = whoMatch[1].trim();
            lastPersonName = lastPersonName.charAt(0).toUpperCase() + lastPersonName.slice(1).toLowerCase();
          }
        }
      }

      console.log(`📌 Context: lastPerson="${lastPersonName}", type="${lastPersonType}"`);

      // Resolve pronouns
      const hasPronoun = /\b(his|her|he|she|they|their|them|they're|this student|this teacher|that student|that teacher|this|that)\b/i.test(lowerQuery);

      if (hasPronoun && lastPersonName) {
        if (lowerQuery.includes('attendance') || lowerQuery.includes('report')) {
          resolvedQuery = `Show attendance report for ${lastPersonName}`;
        } else if (lowerQuery.includes('class') || lowerQuery.includes('took') || lowerQuery.includes('teach') || lowerQuery.includes('how many')) {
          if (lastPersonType === 'teacher') {
            if (lowerQuery.includes('each') || lowerQuery.includes('subject') || lowerQuery.includes('per')) {
              resolvedQuery = `How many classes taken by ${lastPersonName}`;
            } else {
              resolvedQuery = `Which classes did ${lastPersonName} take today`;
            }
          } else {
            resolvedQuery = `Show attendance report for ${lastPersonName}`;
          }
        } else if (lowerQuery.includes('subject')) {
          resolvedQuery = `What subjects does ${lastPersonName} teach`;
        } else if (lowerQuery.includes('detail') || lowerQuery.includes('info')) {
          resolvedQuery = `Show details for ${lastPersonName}`;
        } else if (lowerQuery.includes('mentor')) {
          resolvedQuery = `Who is the mentor for ${lastPersonName}`;
        } else {
          resolvedQuery = lowerQuery
            .replace(/\b(his|her|their)\b/gi, `${lastPersonName}'s`)
            .replace(/\b(he|she|they|they're|them|this student|this teacher|that student|that teacher|this|that)\b/gi, lastPersonName);
        }
        console.log(`🔄 Pronoun resolved: "${userQuery}" → "${resolvedQuery}"`);
      }

      // Resolve follow-up patterns
      if (!hasPronoun) {
        const followUpPatterns = [
          /^(?:what about|how about|and for|also|same for|check for|show for|now for|now check)\s+(.+)/i,
        ];
        let followUpResolved = false;
        for (const pattern of followUpPatterns) {
          const match = lowerQuery.match(pattern);
          if (match && match[1]) {
            const newSubject = match[1].trim();
            const lastUserMsgs = conversationHistory.filter(m => m.role === 'user');
            if (lastUserMsgs.length > 0) {
              const lastQ = (lastUserMsgs[lastUserMsgs.length - 1].content || '').toLowerCase();
              if (lastQ.includes('attendance') || lastQ.includes('report')) {
                resolvedQuery = `Show attendance report for ${newSubject}`;
              } else if (lastQ.includes('subject') || lastQ.includes('course')) {
                resolvedQuery = `Show subjects for ${newSubject}`;
              } else {
                resolvedQuery = `Show details for ${newSubject}`;
              }
              console.log(`🔄 Follow-up resolved: "${userQuery}" → "${resolvedQuery}"`);
              followUpResolved = true;
            }
            break;
          }
        }

        // Contextual follow-up: implicit references to previously discussed person
        // e.g. "how many classes took for each subjects" when teacher was just discussed
        if (!followUpResolved && lastPersonName && resolvedQuery === userQuery) {
          const isAboutClasses = lowerQuery.match(/(?:how many|total|number of)\s+(?:classes|sessions|lectures)|classes\s+(?:took|taken|conducted|held)/i);
          const isAboutSubjects = lowerQuery.match(/(?:which|what|list)\s+subjects?|subjects?\s+(?:taught|assigned|teach)/i);
          const isAboutTeaching = lowerQuery.match(/(?:teach|taught|took|taken|conducted)/i);
          const hasNoName = !lowerQuery.match(/(?:for|by|of)\s+(?:ms|mr|mrs|dr|prof)?\.?\s*[A-Z][a-z]+/i);

          if (hasNoName && lastPersonType === 'teacher') {
            if (isAboutClasses || (isAboutTeaching && (lowerQuery.includes('each') || lowerQuery.includes('subject') || lowerQuery.includes('per')))) {
              resolvedQuery = `How many classes taken by ${lastPersonName}`;
              console.log(`🔄 Context follow-up (teacher classes): "${userQuery}" → "${resolvedQuery}"`);
            } else if (isAboutSubjects) {
              resolvedQuery = `What subjects does ${lastPersonName} teach`;
              console.log(`🔄 Context follow-up (teacher subjects): "${userQuery}" → "${resolvedQuery}"`);
            }
          } else if (hasNoName && lastPersonType === 'student') {
            if (isAboutClasses || isAboutTeaching) {
              resolvedQuery = `Show attendance report for ${lastPersonName}`;
              console.log(`🔄 Context follow-up (student attendance): "${userQuery}" → "${resolvedQuery}"`);
            } else if (isAboutSubjects) {
              resolvedQuery = `Show subjects for ${lastPersonName}`;
              console.log(`🔄 Context follow-up (student subjects): "${userQuery}" → "${resolvedQuery}"`);
            }
          }
        }
      }

      // Resolve affirmatives
      const affirmatives = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'yea', 'ya', 'y', 'please', 'go ahead', 'do it'];
      if (affirmatives.includes(lowerQuery.replace(/[!.?,]/g, '').trim())) {
        const lastMsg = conversationHistory.filter(m => m.role === 'assistant').pop();
        if (lastMsg?.suggestions?.length > 0) {
          resolvedQuery = lastMsg.suggestions[0];
          console.log(`🔄 Affirmative → suggestion: "${resolvedQuery}"`);
        } else if (lastPersonName) {
          resolvedQuery = `Show attendance report for ${lastPersonName}`;
          console.log(`🔄 Affirmative → attendance for: "${lastPersonName}"`);
        }
      }
    }

    // ================================================================
    // STEP 3: GENERATE MONGODB QUERY
    // ================================================================

    let queryInfo;
    try {
      queryInfo = await queryGenerator.generateMongoQuery(resolvedQuery);
      console.log(`📋 QUERY: collection=${queryInfo.collection} operation=${queryInfo.operation}`);
    } catch (queryGenErr) {
      console.error('Query generation failed:', queryGenErr.message);
      return res.json({
        success: true,
        answer: `I had trouble understanding that query. Could you rephrase it?\n\n**Examples:**\n- "List all BCA students"\n- "Show ${resolvedQuery.split(' ')[0]}'s attendance"\n- "Today's classes"`,
        queryInfo: { collection: null, operation: null, explanation: 'Query generation failed' },
        resultCount: 0
      });
    }

    // If query generator returned null collection, it's a general question
    if (!queryInfo.collection || queryInfo.collection === null) {
      console.log(`📚 Query returned null — routing to general handler`);
      try {
        const generalAnswer = await aiService.answerGeneralQuestion(userQuery, conversationHistory);
        return res.json({
          success: true,
          answer: generalAnswer,
          queryInfo: { collection: null, operation: null, explanation: 'General response' },
          resultCount: 0
        });
      } catch (e) {
        return res.json({
          success: true,
          answer: queryInfo.explanation || "Hello! Ask me anything about students, attendance, teachers, or academic policies.",
          queryInfo,
          resultCount: 0
        });
      }
    }

    // ================================================================
    // STEP 4: CONTEXT INJECTION FOR TEACHER-BASED QUERIES
    // ================================================================

    if (queryInfo.collection === 'attendance' && queryInfo.operation === 'find' && conversationHistory.length > 0) {
      let contextTeacher = null;

      const recentAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant');
      if (recentAssistant?.content) {
        const patterns = [
          /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\*\*/,
          /(?:Dr\.\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is a|teaches|is associated)/i,
        ];
        const skipWords = ['The', 'Here', 'This', 'However', 'Based', 'Unfortunately', 'Overall', 'Dear', 'Please', 'Found', 'No', 'What'];
        for (const p of patterns) {
          const m = recentAssistant.content.match(p);
          if (m && m[1] && m[1].length > 2 && !skipWords.includes(m[1].split(' ')[0])) {
            contextTeacher = m[1].trim();
            break;
          }
        }
      }

      if (contextTeacher && (lowerQuery.includes('class') || lowerQuery.includes('took') ||
        lowerQuery.includes('his ') || lowerQuery.includes('her ') || lowerQuery.includes('today'))) {
        console.log(`🎯 Context injection for teacher: "${contextTeacher}"`);
        try {
          const { getDB } = require('../config/database');
          const db = getDB();
          const teacher = await db.collection('teachers').findOne({ name: { $regex: contextTeacher, $options: 'i' } });
          if (teacher?.email) {
            const teacherFilter = {
              $or: [
                { teacherEmail: { $regex: teacher.email, $options: 'i' } },
                { teacherName: { $regex: contextTeacher, $options: 'i' } }
              ]
            };
            if (typeof queryInfo.query === 'object' && !Array.isArray(queryInfo.query)) {
              Object.assign(queryInfo.query, teacherFilter);
            }
          }
        } catch (e) {
          console.log(`⚠️ Context injection failed:`, e.message);
        }
      }
    }

    // ================================================================
    // STEP 5: EXECUTE QUERY
    // ================================================================

    let queryResults;
    try {
      queryResults = await queryGenerator.executeQuery(queryInfo);
      console.log(`📊 RESULTS: ${Array.isArray(queryResults) ? queryResults.length + ' records' : queryResults}`);
    } catch (executeError) {
      const errMsg = executeError.message;
      console.error('Query execution failed:', errMsg);

      if (errMsg.startsWith('NO_ATTENDANCE_RECORDS:')) {
        const [, studentName, stream, semester] = errMsg.split(':');
        return res.json({
          success: true,
          answer: `## Student Found: ${studentName}\n\n**Stream:** ${stream} | **Semester:** ${semester}\n\n## No Classes Conducted Yet\n\nThere are no attendance records for ${stream} Semester ${semester}. Classes may not have started for this stream/semester yet.\n\n**Try:**\n- Check another semester\n- View subjects for this stream\n- See recent classes`,
          queryInfo: { collection: queryInfo.collection, operation: queryInfo.operation, explanation: 'No attendance records' },
          resultCount: 0
        });
      }

      if (errMsg.startsWith('STUDENT_EXISTS_NO_ATTENDANCE:')) {
        const [, studentName, stream, semester, studentID] = errMsg.split(':');
        return res.json({
          success: true,
          answer: `## Student Found: ${studentName}\n\n**ID:** ${studentID} | **Stream:** ${stream} | **Semester:** ${semester}\n\n## No Attendance Records\n\nThis student is registered but has no attendance recorded yet. They may not have attended any classes, or attendance marking hasn't started.\n\n**Try:**\n- Check all ${stream} students\n- View recent classes\n- Check subjects for this stream`,
          queryInfo: { collection: queryInfo.collection, operation: queryInfo.operation, explanation: 'Student found, no attendance' },
          resultCount: 0
        });
      }

      if (errMsg.startsWith('STUDENT_NOT_FOUND:')) {
        const studentName = errMsg.split(':')[1];
        try {
          const { getDB } = require('../config/database');
          const db = getDB();
          const fuzzy = await db.collection('students')
            .find({ name: { $regex: studentName.split(' ')[0], $options: 'i' }, isActive: true })
            .limit(5).toArray();

          if (fuzzy.length > 0) {
            const suggestions = fuzzy.map(s => `- **${s.name}** (${s.stream} Sem ${s.semester})`).join('\n');
            return res.json({
              success: true,
              answer: `## Student Not Found: "${studentName}"\n\nI couldn't find an exact match. Did you mean one of these?\n\n${suggestions}`,
              queryInfo: { collection: 'students', operation: 'find', explanation: 'Fuzzy suggestions' },
              resultCount: 0
            });
          }
        } catch (e) { console.error('Fuzzy search failed:', e.message); }

        return res.json({
          success: true,
          answer: `## Student Not Found: "${studentName}"\n\nNo student with that name exists in the system.\n\n**Suggestions:**\n- Check the spelling\n- Try just the first name or last name\n- Search by stream: "List BCA students"\n- List all: "Show all students"`,
          queryInfo: { collection: 'students', operation: 'find', explanation: 'Student not found' },
          resultCount: 0
        });
      }

      return res.json({
        success: true,
        answer: `## Query Error\n\nSomething went wrong while searching the database.\n\n**Error:** ${errMsg}\n\n**Try:**\n- Rephrase your question\n- Use simpler search terms\n- Example: "List all students" or "Today's attendance"`,
        queryInfo: { collection: queryInfo.collection, operation: queryInfo.operation, explanation: 'Execution error' },
        resultCount: 0
      });
    }

    // ================================================================
    // STEP 5.5: SUBJECT-WISE DEFAULTER RESPONSE
    // ================================================================

    if (queryResults && queryResults._subjectWise) {
      const { stream, semester, subjects, totalStudents, defaulterCount, students } = queryResults;

      let answer = `## Subject-Wise Defaulters — ${stream} Semester ${semester}\n\n`;
      answer += `**${defaulterCount}** out of **${totalStudents}** students have at least one subject below 75%.\n\n`;

      if (students.length === 0) {
        answer += `All students in ${stream} Semester ${semester} have 75%+ attendance in every subject.`;
      } else {
        // Build Markdown table with subject columns
        // Use short subject names if too many columns
        const shortNames = subjects.map(s => s.length > 15 ? s.substring(0, 13) + '..' : s);

        answer += `| # | ID | NAME |`;
        shortNames.forEach(s => { answer += ` ${s} |`; });
        answer += `\n`;

        answer += `| --- | --- | --- |`;
        shortNames.forEach(() => { answer += ` --- |`; });
        answer += `\n`;

        students.forEach((student, idx) => {
          answer += `| ${idx + 1} | ${student.studentID} | ${student.name} |`;
          subjects.forEach(sub => {
            const data = student.subjects[sub];
            const pct = data ? data.percentage : 0;
            const marker = pct < 75 ? `**${pct}%**` : `${pct}%`;
            answer += ` ${marker} |`;
          });
          answer += `\n`;
        });

        // Summary insight
        const avgDefaults = students.reduce((sum, s) => {
          return sum + Object.values(s.subjects).filter(v => v.percentage < 75 && v.total > 0).length;
        }, 0) / students.length;

        answer += `\n*Values in bold are below 75%. Average defaulting subjects per student: ${avgDefaults.toFixed(1)}*`;
      }

      return res.json({
        success: true,
        answer,
        queryInfo: {
          collection: 'students',
          operation: 'subjectWiseDefaulters',
          explanation: queryInfo.explanation
        },
        resultCount: defaulterCount
      });
    }

    // STEP 6: SMART RETRY IF NO RESULTS
    // ================================================================

    if (!queryResults || (Array.isArray(queryResults) && queryResults.length === 0)) {
      console.log('⚠️ No results — attempting smart retry...');

      const namePatterns = [
        /(?:attendance|report|details|info)\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
        /(?:show|find|get|search)\s+(.+?)(?:'s|\s+attendance|\s+report|\s+details|\?|$)/i,
        /(.+?)(?:'s|s')\s+(?:attendance|report|details)/i,
        /(?:what about|how about|and for|check for)\s+(.+?)(?:\?|$)/i
      ];

      let retryName = null;
      for (const pattern of namePatterns) {
        const match = resolvedQuery.match(pattern);
        if (match && match[1]) {
          retryName = match[1].trim().replace(/^(?:student|named?)\s+/i, '');
          if (retryName.length > 2) break;
          retryName = null;
        }
      }

      if (retryName) {
        console.log(`🔄 Smart retry for: "${retryName}"`);
        try {
          const { getDB } = require('../config/database');
          const db = getDB();

          const retryWords = retryName.split(/\s+/).filter(w => w.length > 0);
          const retryRegex = retryWords.length > 1
            ? retryWords.map(w => `(?=.*${w})`).join('')
            : retryName;

          const studentMatch = await db.collection('students').findOne({
            name: { $regex: retryRegex, $options: 'i' }, isActive: true
          });

          if (studentMatch) {
            console.log(`✅ Smart retry found: ${studentMatch.name}`);
            const retryQueryInfo = queryGenerator.buildStudentAttendanceQuery(studentMatch.name);
            const retryResults = await queryGenerator.executeQuery(retryQueryInfo);

            if (retryResults && Array.isArray(retryResults) && retryResults.length > 0) {
              queryResults = retryResults;
              queryInfo.explanation = retryQueryInfo.explanation;
              console.log(`✅ Smart retry success: ${retryResults.length} results`);
            } else {
              return res.json({
                success: true,
                answer: `## Student Found: ${studentMatch.name}\n\n**ID:** ${studentMatch.studentID} | **Stream:** ${studentMatch.stream} | **Semester:** ${studentMatch.semester}\n\nThis student is registered but has no attendance records yet.\n\n**Try:**\n- Check all ${studentMatch.stream} students\n- View subjects for ${studentMatch.stream} Semester ${studentMatch.semester}`,
                queryInfo: { collection: 'students', operation: 'find', explanation: 'Found, no attendance' },
                resultCount: 0
              });
            }
          } else {
            // Fuzzy fallback suggestions
            const fuzzy = await db.collection('students')
              .find({ name: { $regex: retryName.split(' ')[0], $options: 'i' }, isActive: true })
              .limit(5).toArray();

            if (fuzzy.length > 0) {
              const suggestionList = fuzzy.map(s => `- **${s.name}** (${s.stream} Sem ${s.semester})`).join('\n');
              return res.json({
                success: true,
                answer: `## No Exact Match for "${retryName}"\n\nDid you mean one of these?\n\n${suggestionList}\n\nTry using the exact name from the list above.`,
                queryInfo: { collection: 'students', operation: 'find', explanation: 'Fuzzy suggestions' },
                resultCount: 0
              });
            }
          }
        } catch (retryErr) {
          console.error('Smart retry failed:', retryErr.message);
        }
      }

      // Still no results
      if (!queryResults || (Array.isArray(queryResults) && queryResults.length === 0)) {
        let noResultMsg = `## No Results Found\n\nI couldn't find any records matching your search.\n\n`;

        if (queryInfo.collection === 'students') {
          noResultMsg += `**Suggestions:**\n- Check the spelling of the name\n- Try searching by stream: "Show BCA students"\n- List all: "Show all students"\n- Search by ID if you have it`;
        } else if (queryInfo.collection === 'attendance') {
          try {
            const { getDB } = require('../config/database');
            const db = getDB();
            const recentDates = await db.collection('attendance').aggregate([
              { $group: { _id: "$date" } },
              { $sort: { _id: -1 } },
              { $limit: 5 }
            ]).toArray();

            if (recentDates.length > 0) {
              const dateList = recentDates.map(d => {
                const dateStr = d._id ? new Date(d._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : d._id;
                return `- ${dateStr}`;
              }).join('\n');
              noResultMsg += `**No records for that date. Recent dates with data:**\n\n${dateList}`;
            } else {
              noResultMsg += `No attendance records exist in the system yet.`;
            }
          } catch (e) {
            noResultMsg += `**Suggestions:**\n- Try "Show recent classes"\n- Try "Today's attendance"\n- Check the date format (DD-MM-YYYY)`;
          }
        } else if (queryInfo.collection === 'subjects') {
          noResultMsg += `**Suggestions:**\n- Verify stream name (BCA, BBA, BCOM, BDA, MCA, MBA)\n- Check semester number (1-6)\n- Try: "Show BCA subjects"`;
        } else {
          noResultMsg += `**Suggestions:**\n- Rephrase your question\n- Use simpler terms\n- Try: "List all students" or "Show all subjects"`;
        }

        return res.json({
          success: true,
          answer: noResultMsg,
          queryInfo: { collection: queryInfo.collection, operation: queryInfo.operation, explanation: 'No results' },
          resultCount: 0
        });
      }
    }

    // ================================================================
    // STEP 7: SMART FILTER FOR TEACHER CONTEXT
    // ================================================================

    if (Array.isArray(queryResults) && queryResults.length > 0 && conversationHistory.length > 0) {
      const hasTeacherField = queryResults[0].teacherName || queryResults[0].teacherEmail;
      if (hasTeacherField) {
        let contextTeacherName = null;
        const lastAI = [...conversationHistory].reverse().find(m => m.role === 'assistant');
        if (lastAI?.content) {
          const patterns = [
            /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\*\*/,
            /(?:teacher|faculty|professor)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          ];
          const skipWords = ['The', 'Here', 'This', 'However', 'Based', 'Overall', 'Dear', 'Please', 'Found', 'No', 'What', 'Today'];
          for (const p of patterns) {
            const m = lastAI.content.match(p);
            if (m && m[1] && m[1].length > 2 && !skipWords.includes(m[1].split(' ')[0])) {
              contextTeacherName = m[1].trim();
              break;
            }
          }
        }
        if (contextTeacherName) {
          const searchTerm = contextTeacherName.split(/[\s@]/)[0].toLowerCase();
          const filtered = queryResults.filter(r =>
            (r.teacherName || '').toLowerCase().includes(searchTerm) ||
            (r.teacherEmail || '').toLowerCase().includes(searchTerm)
          );
          if (filtered.length > 0) {
            console.log(`🎯 Teacher filter: ${queryResults.length} → ${filtered.length}`);
            queryResults = filtered;
          }
        }
      }
    }

    // ================================================================
    // STEP 8: GENERATE RESPONSE
    // ================================================================

    let naturalResponse;

    try {
      const isIndividualReport = queryInfo.explanation &&
        Array.isArray(queryResults) && queryResults.length > 0 &&
        queryResults[0].studentName &&
        typeof queryInfo.explanation === 'string' &&
        queryInfo.explanation.toLowerCase().includes('attendance report');

      if (isIndividualReport) {
        naturalResponse = queryGenerator.formatAttendanceReport(queryResults);
        console.log(`✅ Used attendance report formatter`);
      } else {
        naturalResponse = await queryGenerator.generateNaturalResponse(userQuery, queryResults, queryInfo);
        console.log(`✅ Used natural response generator`);
      }
    } catch (responseErr) {
      console.error('Response generation failed:', responseErr.message);
      const tableFormat = queryGenerator.formatAsTable(queryResults, queryInfo.collection, userQuery);
      naturalResponse = tableFormat || queryGenerator.friendlyFormatResults(queryResults, userQuery, queryInfo.collection);
    }

    // ================================================================
    // STEP 9: EXTRACT SUGGESTIONS AND SEND RESPONSE
    // ================================================================

    let extractedSuggestions = [];
    if (naturalResponse) {
      const suggestionsMatch = naturalResponse.match(/\n\n\*\*💡 Suggested Follow-ups:\*\*\n([\s\S]*)$/);
      if (suggestionsMatch && suggestionsMatch[1]) {
        const bullets = suggestionsMatch[1].match(/-\s\*(.+?)\*/g);
        if (bullets) {
          extractedSuggestions = bullets.map(b => b.replace(/^-\s\*/, '').replace(/\*$/, '').trim());
        }
        naturalResponse = naturalResponse.replace(/\n\n\*\*💡 Suggested Follow-ups:\*\*\n([\s\S]*)$/, '');
      }
    }

    const resultCount = Array.isArray(queryResults)
      ? queryResults.length
      : typeof queryResults === 'number'
        ? queryResults
        : 1;

    return res.json({
      success: true,
      answer: (naturalResponse || 'Query processed but no response generated. Please try again.').trim(),
      suggestions: extractedSuggestions,
      queryInfo: {
        collection: queryInfo.collection,
        operation: queryInfo.operation,
        explanation: queryInfo.explanation || 'Query executed'
      },
      resultCount,
      rawData: Array.isArray(queryResults) && queryResults.length > 1 ? queryResults : null
    });

  } catch (error) {
    console.error('❌ Chat route error:', error.message);
    console.error(error.stack);

    const errMsg = error.message || String(error);
    let errorMessage = `## Something Went Wrong\n\nI encountered an unexpected error.\n\n`;

    if (errMsg.includes('overloaded') || errMsg.includes('503')) {
      errorMessage += `The AI service is under high load. Please wait a moment and try again.`;
    } else if (errMsg.includes('rate') || errMsg.includes('429')) {
      errorMessage += `Rate limit reached. Please wait a few seconds and try again.`;
    } else if (errMsg.includes('MongoDB') || errMsg.includes('database')) {
      errorMessage += `Database connection issue. Please refresh and try again.`;
    } else if (errMsg.includes('JSON') || errMsg.includes('parse')) {
      errorMessage += `I had trouble understanding that query. Try rephrasing it.\n\n**Example:** "Show attendance for Amrutha" or "List BCA students"`;
    } else {
      errorMessage += `**Error:** ${errMsg}\n\n**Try:** Rephrasing your question or using a simpler query.`;
    }

    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'Online',
    message: 'SAAME Academic Assistant is ready',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    model: 'llama-3.3-70b-versatile (Groq)',
    features: [
      'Intent Classification (DB vs General)',
      'College Knowledge Base (Policies, NAAC, Rules)',
      'Student Search & Attendance Reports',
      'Teacher Info & Mentorship Queries',
      'Analytics (Top, Bottom, Defaulters, Comparisons)',
      'Pronoun & Follow-up Resolution',
      'Smart Retry on Zero Results',
      'Fuzzy Name Matching'
    ]
  });
});

module.exports = router;