const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function checkTeacher() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Teacher = mongoose.model('Teacher', new mongoose.Schema({}, { strict: false }), 'teachers');
        const teacher = await Teacher.findOne({ mentees: { $exists: true, $not: { $size: 0 } } });
        console.log('Sample Teacher with mentees:', JSON.stringify(teacher, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkTeacher();
