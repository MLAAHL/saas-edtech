const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function checkStudent() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Student = mongoose.model('Student', new mongoose.Schema({
            name: String,
            studentID: String,
            mentorEmail: String
        }), 'students');

        const students = await Student.find({
            name: { $regex: 'deepika', $options: 'i' }
        });

        console.log('Results found:', JSON.stringify(students, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkStudent();
