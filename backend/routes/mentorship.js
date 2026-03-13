const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');

// Get all mentors and their mentee counts
router.get('/stats', async (req, res) => {
    try {
        const teachers = await Teacher.find({}, 'name email mentees');
        const stats = teachers.map(t => ({
            name: t.name || t.email.split('@')[0],
            email: t.email,
            menteeCount: t.mentees ? t.mentees.length : 0
        }));
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Assign students to a mentor
router.post('/assign', async (req, res) => {
    try {
        let { mentorEmail, studentIDs } = req.body;

        if (!mentorEmail || !studentIDs || !Array.isArray(studentIDs)) {
            return res.status(400).json({ success: false, error: 'Mentor email and array of student IDs required' });
        }

        // 1. Clean input list (unique + uppercase)
        studentIDs = [...new Set(studentIDs.map(id => id.toString().trim().toUpperCase()))];

        const teacher = await Teacher.findOne({ email: mentorEmail.toLowerCase().trim() });
        if (!teacher) {
            return res.status(404).json({ success: false, error: 'Mentor not found' });
        }

        // 2. Fetch student details to store in teacher schema
        const students = await Student.find({ studentID: { $in: studentIDs } });
        const foundIDs = new Set(students.map(s => s.studentID));

        // 3. Identify missing USNs
        const missingIDs = studentIDs.filter(id => !foundIDs.has(id));

        const newMentees = students.map(s => ({
            studentID: s.studentID,
            name: s.name,
            stream: s.stream,
            semester: s.semester,
            addedAt: new Date()
        }));

        // 4. Add to teacher's mentees (avoid duplicates already in this teacher's list)
        const alreadyInMentorListIDs = new Set(teacher.mentees.map(m => m.studentID));
        const filteredNewMentees = newMentees.filter(m => !alreadyInMentorListIDs.has(m.studentID));
        const duplicateInListCount = newMentees.length - filteredNewMentees.length;

        teacher.mentees.push(...filteredNewMentees);
        await teacher.save();

        // 5. Sync back to Student records
        await Student.updateMany(
            { studentID: { $in: Array.from(foundIDs) } },
            { $set: { mentorEmail: mentorEmail.toLowerCase().trim() } }
        );

        let finalMsg = `Assigned ${filteredNewMentees.length} students.`;
        if (missingIDs.length > 0) finalMsg += ` (${missingIDs.length} IDs not found in database: ${missingIDs.join(', ')}).`;
        if (duplicateInListCount > 0) finalMsg += ` (${duplicateInListCount} were already assigned to this mentor).`;

        res.json({
            success: true,
            message: finalMsg,
            totalMentees: teacher.mentees.length,
            missingIDs: missingIDs
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove a mentee from a mentor
router.post('/remove', async (req, res) => {
    try {
        const { mentorEmail, studentID } = req.body;

        const teacher = await Teacher.findOneAndUpdate(
            { email: mentorEmail.toLowerCase().trim() },
            { $pull: { mentees: { studentID: studentID } } },
            { new: true }
        );

        // Sync back to Student record (clear the mentor email)
        await Student.updateOne(
            { studentID: studentID },
            { $set: { mentorEmail: null } }
        );

        res.json({ success: true, message: 'Mentee removed', totalMentees: teacher.mentees.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk remove mentees from a mentor
router.post('/remove-bulk', async (req, res) => {
    try {
        const { mentorEmail, studentIDs } = req.body;

        if (!mentorEmail || !studentIDs || !Array.isArray(studentIDs)) {
            return res.status(400).json({ success: false, error: 'Mentor email and array of student IDs required' });
        }

        const teacher = await Teacher.findOneAndUpdate(
            { email: mentorEmail.toLowerCase().trim() },
            { $pull: { mentees: { studentID: { $in: studentIDs } } } },
            { new: true }
        );

        if (!teacher) {
            return res.status(404).json({ success: false, error: 'Mentor not found' });
        }

        // Sync back to Student records (clear the mentor email)
        await Student.updateMany(
            { studentID: { $in: studentIDs } },
            { $set: { mentorEmail: null } }
        );

        res.json({
            success: true,
            message: `Removed ${studentIDs.length} mentees successfully`,
            totalMentees: teacher.mentees.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search students by name or USN
router.get('/search-students', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ success: true, students: [] });

        const students = await Student.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { studentID: { $regex: q, $options: 'i' } }
            ]
        }, 'name studentID stream semester').limit(10);

        res.json({ success: true, students });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
