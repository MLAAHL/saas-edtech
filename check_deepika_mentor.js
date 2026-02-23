const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function checkDeepikaMentor() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Teacher = mongoose.model('Teacher', new mongoose.Schema({}, { strict: false }), 'teachers');

        const teacher = await Teacher.findOne({
            "mentees.name": { $regex: 'DEEPIKA R', $options: 'i' }
        });

        if (teacher) {
            console.log(`Deepika R's mentor is: ${teacher.name} (${teacher.email})`);
        } else {
            console.log("No mentor found for Deepika R in teachers collection.");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkDeepikaMentor();
