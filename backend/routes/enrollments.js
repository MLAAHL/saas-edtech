// routes/enrollments.js
// Handles student enrollments for special/combined subjects
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const firebaseAuth = require('../middleware/firebaseAuth');

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
// GET ENROLLMENTS FOR A SUBJECT
// ============================================================================

router.get('/subject/:subjectCode', async (req, res) => {
    try {
        const { subjectCode } = req.params;
        const { semester } = req.query;

        console.log(`📚 Fetching enrollments for subject: ${subjectCode}`);

        const query = { subjectCode: subjectCode.toUpperCase() };
        if (semester) query.semester = parseInt(semester);

        const enrollments = await req.db.collection('enrollments')
            .find(query)
            .toArray();

        // Get student details for enrolled students
        const studentIDs = enrollments.map(e => e.studentID);

        const students = await req.db.collection('students')
            .find({ studentID: { $in: studentIDs }, isActive: true })
            .sort({ name: 1 })
            .toArray();

        console.log(`✅ Found ${students.length} enrolled students`);

        res.json({
            success: true,
            subjectCode: subjectCode.toUpperCase(),
            enrollments: enrollments,
            students: students,
            count: students.length,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ Error fetching enrollments:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET STUDENTS FOR ATTENDANCE (Combined Subject Support)
// ============================================================================

router.get('/attendance-students', async (req, res) => {
    try {
        const { subjectCode, stream, semester } = req.query;

        if (!subjectCode) {
            return res.status(400).json({
                success: false,
                error: 'subjectCode is required'
            });
        }

        console.log(`📚 Fetching students for attendance: ${subjectCode}`);

        // First check if this is a combined subject with enrollments
        const enrollments = await req.db.collection('enrollments')
            .find({
                subjectCode: subjectCode.toUpperCase(),
                isActive: { $ne: false }
            })
            .toArray();

        let students;

        if (enrollments.length > 0) {
            // Combined subject - fetch only enrolled students
            console.log(`📌 Combined subject detected - ${enrollments.length} enrollments`);

            const studentIDs = enrollments.map(e => e.studentID);
            students = await req.db.collection('students')
                .find({
                    studentID: { $in: studentIDs },
                    isActive: true
                })
                .sort({ name: 1 })
                .toArray();
        } else {
            // Regular subject - fetch by stream and semester
            console.log(`📌 Regular subject - using stream/semester filter`);

            if (!stream || !semester) {
                return res.status(400).json({
                    success: false,
                    error: 'For regular subjects, stream and semester are required'
                });
            }

            students = await req.db.collection('students')
                .find({
                    stream: stream,
                    semester: parseInt(semester),
                    isActive: true
                })
                .sort({ name: 1 })
                .toArray();
        }

        console.log(`✅ Found ${students.length} students for attendance`);

        res.json({
            success: true,
            subjectCode: subjectCode.toUpperCase(),
            isCombinedClass: enrollments.length > 0,
            students: students,
            count: students.length,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ Error fetching attendance students:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADD STUDENT TO SUBJECT (ENROLL)
// ============================================================================

router.post('/', firebaseAuth, async (req, res) => {
    try {
        const { studentID, subjectCode, semester, academicYear } = req.body;

        console.log(`➕ Enrolling student ${studentID} to ${subjectCode}`);

        if (!studentID || !subjectCode) {
            return res.status(400).json({
                success: false,
                error: 'studentID and subjectCode are required'
            });
        }

        // Check if student exists
        const student = await req.db.collection('students').findOne({ studentID });
        if (!student) {
            return res.status(404).json({
                success: false,
                error: 'Student not found'
            });
        }

        // Check if already enrolled
        const existing = await req.db.collection('enrollments').findOne({
            studentID: studentID,
            subjectCode: subjectCode.toUpperCase()
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Student is already enrolled in this subject'
            });
        }

        const enrollment = {
            studentID: studentID,
            studentName: student.name,
            studentStream: student.stream,
            subjectCode: subjectCode.toUpperCase(),
            semester: semester || student.semester,
            academicYear: academicYear || new Date().getFullYear(),
            isActive: true,
            enrolledAt: new Date(),
            enrolledBy: req.user?.email || 'system'
        };

        const result = await req.db.collection('enrollments').insertOne(enrollment);

        console.log(`✅ Student enrolled successfully: ${result.insertedId}`);

        res.status(201).json({
            success: true,
            message: 'Student enrolled successfully',
            enrollment: { ...enrollment, _id: result.insertedId }
        });

    } catch (error) {
        console.error('❌ Error enrolling student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// BULK ENROLL STUDENTS
// ============================================================================

router.post('/bulk', firebaseAuth, async (req, res) => {
    try {
        const { studentIDs, subjectCode, semester, academicYear } = req.body;

        console.log(`➕ Bulk enrolling ${studentIDs?.length} students to ${subjectCode}`);

        if (!Array.isArray(studentIDs) || studentIDs.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'studentIDs array is required'
            });
        }

        if (!subjectCode) {
            return res.status(400).json({
                success: false,
                error: 'subjectCode is required'
            });
        }

        // Get student details
        const students = await req.db.collection('students')
            .find({ studentID: { $in: studentIDs } })
            .toArray();

        if (students.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No students found with provided IDs'
            });
        }

        // Check existing enrollments
        const existingEnrollments = await req.db.collection('enrollments')
            .find({
                studentID: { $in: studentIDs },
                subjectCode: subjectCode.toUpperCase()
            })
            .toArray();

        const existingStudentIDs = new Set(existingEnrollments.map(e => e.studentID));

        // Prepare new enrollments
        const newEnrollments = students
            .filter(s => !existingStudentIDs.has(s.studentID))
            .map(student => ({
                studentID: student.studentID,
                studentName: student.name,
                studentStream: student.stream,
                subjectCode: subjectCode.toUpperCase(),
                semester: semester || student.semester,
                academicYear: academicYear || new Date().getFullYear(),
                isActive: true,
                enrolledAt: new Date(),
                enrolledBy: req.user?.email || 'system'
            }));

        if (newEnrollments.length === 0) {
            return res.json({
                success: true,
                message: 'All students are already enrolled',
                insertedCount: 0,
                skippedCount: studentIDs.length
            });
        }

        const result = await req.db.collection('enrollments').insertMany(newEnrollments);

        console.log(`✅ Bulk enrolled ${result.insertedCount} students`);

        res.status(201).json({
            success: true,
            message: `Successfully enrolled ${result.insertedCount} students`,
            insertedCount: result.insertedCount,
            skippedCount: existingStudentIDs.size
        });

    } catch (error) {
        console.error('❌ Error bulk enrolling:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// REMOVE STUDENT FROM SUBJECT (UNENROLL)
// ============================================================================

router.delete('/:enrollmentId', firebaseAuth, async (req, res) => {
    try {
        const { enrollmentId } = req.params;

        console.log(`🗑️ Removing enrollment: ${enrollmentId}`);

        if (!ObjectId.isValid(enrollmentId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid enrollment ID'
            });
        }

        const result = await req.db.collection('enrollments').deleteOne({
            _id: new ObjectId(enrollmentId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        console.log(`✅ Enrollment removed`);

        res.json({
            success: true,
            message: 'Student unenrolled successfully'
        });

    } catch (error) {
        console.error('❌ Error removing enrollment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// REMOVE STUDENT BY studentID and subjectCode
// ============================================================================

router.delete('/student/:studentID/subject/:subjectCode', firebaseAuth, async (req, res) => {
    try {
        const { studentID, subjectCode } = req.params;

        console.log(`🗑️ Removing ${studentID} from ${subjectCode}`);

        const result = await req.db.collection('enrollments').deleteOne({
            studentID: studentID,
            subjectCode: subjectCode.toUpperCase()
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Enrollment not found'
            });
        }

        console.log(`✅ Student unenrolled from subject`);

        res.json({
            success: true,
            message: 'Student unenrolled successfully'
        });

    } catch (error) {
        console.error('❌ Error removing enrollment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// CLEAR ALL ENROLLMENTS FOR A SUBJECT
// ============================================================================

router.delete('/subject/:subjectCode/all', firebaseAuth, async (req, res) => {
    try {
        const { subjectCode } = req.params;

        console.log(`🗑️ Clearing all enrollments for: ${subjectCode}`);

        const result = await req.db.collection('enrollments').deleteMany({
            subjectCode: subjectCode.toUpperCase()
        });

        console.log(`✅ Removed ${result.deletedCount} enrollments`);

        res.json({
            success: true,
            message: `Removed ${result.deletedCount} enrollments`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('❌ Error clearing enrollments:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET ALL COMBINED SUBJECTS (subjects with enrollments)
// ============================================================================

router.get('/combined-subjects', async (req, res) => {
    try {
        console.log('📚 Fetching all combined subjects...');

        // Get unique subject codes from enrollments
        const combinedSubjects = await req.db.collection('enrollments').aggregate([
            { $match: { isActive: { $ne: false } } },
            {
                $group: {
                    _id: '$subjectCode',
                    studentCount: { $sum: 1 },
                    streams: { $addToSet: '$studentStream' },
                    semester: { $first: '$semester' }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();

        console.log(`✅ Found ${combinedSubjects.length} combined subjects`);

        res.json({
            success: true,
            combinedSubjects: combinedSubjects.map(s => ({
                subjectCode: s._id,
                studentCount: s.studentCount,
                streams: s.streams,
                semester: s.semester
            })),
            count: combinedSubjects.length
        });

    } catch (error) {
        console.error('❌ Error fetching combined subjects:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
