// Script to count BCom A&F students
require('dotenv').config({ path: './backend/.env' });
const { MongoClient } = require('mongodb');

async function countBComAF() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI not found');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();

        // Search for variations of "BCom A&F"
        const streams = await db.collection('students').distinct('stream');
        console.log('Available streams:', streams);

        const bcomAFStreams = streams.filter(s => s && (s.includes('A&F') || (s.includes('BCOM') && s.includes('F'))));
        console.log('Target streams found:', bcomAFStreams);

        const counts = await Promise.all(bcomAFStreams.map(async (stream) => {
            const active = await db.collection('students').countDocuments({ stream: stream, isActive: true });
            const total = await db.collection('students').countDocuments({ stream: stream });
            return { stream, active, total };
        }));

        console.log('\n📊 Student Counts for BCom A&F:');
        console.log('─'.repeat(50));
        counts.forEach(c => {
            console.log(`${c.stream.padEnd(20)} | Active: ${c.active} | Total: ${c.total}`);
        });

        const grandTotalActive = counts.reduce((sum, c) => sum + c.active, 0);
        const grandTotal = counts.reduce((sum, c) => sum + c.total, 0);
        console.log('─'.repeat(50));
        console.log(`${'GRAND TOTAL'.padEnd(20)} | Active: ${grandTotalActive} | Total: ${grandTotal}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

countBComAF();
