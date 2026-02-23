const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function debugDeepika() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Teacher = mongoose.model('Teacher', new mongoose.Schema({}, { strict: false }), 'teachers');

        const teacher = await Teacher.findOne({
            "mentees.name": { $regex: 'DEEPIKA R', $options: 'i' }
        });

        if (teacher) {
            console.log(`Found teacher: ${teacher.name}`);
            const deepika = teacher.mentees.find(m => m.name.toUpperCase().includes('DEEPIKA R'));
            if (deepika) {
                console.log(`Exact Name: "${deepika.name}"`);
                console.log(`Length: ${deepika.name.length}`);
                console.log(`Char Codes: ${[...deepika.name].map(c => c.charCodeAt(0))}`);
            } else {
                console.log("Could not find Deepika in mentees array despite MongoDB match.");
                console.log("Mentees names:", teacher.mentees.map(m => `"${m.name}"`));
            }
        } else {
            console.log("No teacher found for Deepika R.");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
debugDeepika();
