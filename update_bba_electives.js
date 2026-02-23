const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function updateElectives() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Student = mongoose.model('Student', new mongoose.Schema({}, { strict: false }), 'students');

        const studentIDs = [
            'U18ER23M0003',
            'U18ER23M0006',
            'U18ER23M0008',
            'U18ER23M0010',
            'U18ER23M0017',
            'U18ER23M0024',
            'U18ER23M0025',
            'U18ER23M0030',
            'U18ER23M0034',
            'U18ER23M0040',
            'U18ER23M0047',
            'U18ER23M0052'
        ];

        console.log(`🚀 Starting update for ${studentIDs.length} students...`);

        const result = await Student.updateMany(
            { studentID: { $in: studentIDs } },
            { $set: { electiveSubject: "MARKETING ANALYTICS" } }
        );

        console.log(`✅ Update complete!`);
        console.log(`📊 Matched: ${result.matchedCount}`);
        console.log(`📝 Modified: ${result.modifiedCount}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error during update:', err);
        process.exit(1);
    }
}

updateElectives();
