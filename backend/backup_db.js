const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';

async function performBackup() {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB for Backup...');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${dateStr}.json`);
    
    const backupData = {};
    
    for (const c of collections) {
      if (c.name === 'system.views') continue;
      const col = db.collection(c.name);
      const docs = await col.find({}).toArray();
      backupData[c.name] = docs;
      console.log(`- Backed up ${c.name} (${docs.length} documents)`);
    }

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`\n🎉 Backup complete! Data saved to: ${backupFile}`);
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
  } finally {
    process.exit();
  }
}

performBackup();
