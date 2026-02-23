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
        const { mentorEmail, studentIDs } = req.body;

        if (!mentorEmail || !studentIDs || !Array.isArray(studentIDs)) {
            return res.status(400).json({ success: false, error: 'Mentor email and array of student IDs required' });
        }

        const teacher = await Teacher.findOne({ email: mentorEmail.toLowerCase().trim() });
        if (!teacher) {
            return res.status(404).json({ success: false, error: 'Mentor not found' });
        }

        // Fetch student details to store in teacher schema
        const students = await Student.find({ studentID: { $in: studentIDs } });

        const newMentees = students.map(s => ({
            studentID: s.studentID,
            name: s.name,
            stream: s.stream,
            semester: s.semester,
            addedAt: new Date()
        }));

        // Add to teacher's mentees (avoid duplicates)
        const existingIDs = new Set(teacher.mentees.map(m => m.studentID));
        const filteredNewMentees = newMentees.filter(m => !existingIDs.has(m.studentID));

        teacher.mentees.push(...filteredNewMentees);
        await teacher.save();

        // Sync back to Student records
        await Student.updateMany(
            { studentID: { $in: studentIDs } },
            { $set: { mentorEmail: mentorEmail.toLowerCase().trim() } }
        );

        res.json({
            success: true,
            message: `Assigned ${filteredNewMentees.length} new students to ${mentorEmail}`,
            totalMentees: teacher.mentees.length
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
