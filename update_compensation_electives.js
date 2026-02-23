const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function updateCompensationElectives() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Student = mongoose.model('Student', new mongoose.Schema({}, { strict: false }), 'students');

        const studentIDs = [
            'U18ER23M0001', 'U18ER23M0004', 'U18ER23M0005', 'U18ER23M0011',
            'U18ER23M0012', 'U18ER23M0013', 'U18ER23M0014', 'U18ER23M0015',
            'U18ER23M0016', 'U18ER23M0018', 'U18ER23M0019', 'U18ER23M0020',
            'U18ER23M0021', 'U18ER23M0022', 'U18ER23M0023', 'U18ER23M0026',
            'U18ER23M0027', 'U18ER23M0028', 'U18ER23M0031', 'U18ER23M0032',
            'U18ER23M0035', 'U18ER23M0036', 'U18ER23M0038', 'U18ER23M0039',
            'U18ER23M0041', 'U18ER23M0042', 'U18ER23M0043', 'U18ER23M0045',
            'U18ER23M0046', 'U18ER23M0048', 'U18ER23M0049', 'U18ER23M0053',
            'U18ER23M0054'
        ];

        console.log(`🚀 Starting update for ${studentIDs.length} students...`);

        const result = await Student.updateMany(
            { studentID: { $in: studentIDs } },
            { $set: { electiveSubject: "COMPENSATION AND PERFORMANCE MANAGEMENT" } }
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

updateCompensationElectives();
