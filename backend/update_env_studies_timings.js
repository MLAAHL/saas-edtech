const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function updateTimings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await mongoose.connection.db.collection('attendance').updateMany(
            { 
                stream: { $in: ['BCA', 'BCA AI & ML'] }, 
                subject: 'ENVIRONMENTAL STUDIES', 
                semester: 2 
            }, 
            { 
                $set: { time: '9:00 AM - 11:00 AM' } 
            }
        );

        console.log(`Successfully updated ${result.modifiedCount} records.`);

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await mongoose.connection.close();
    }
}

updateTimings();
