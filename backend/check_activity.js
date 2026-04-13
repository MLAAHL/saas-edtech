const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('students');
  const count = await col.countDocuments({ lastLogin: { $exists: true } });
  const recent = await col.find({ lastLogin: { $exists: true } }).limit(5).toArray();
  console.log('Count:', count);
  console.log('Recent:', JSON.stringify(recent, null, 2));
  process.exit(0);
}
check().catch(err => {
  console.error(err);
  process.exit(1);
});
