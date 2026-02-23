const mongoose = require('mongoose');

function getDB() {
  if (!mongoose.connection.db) {
    throw new Error('Database not initialized. Make sure MongoDB is connected.');
  }
  return mongoose.connection.db;
}

async function connectDB() {
  // This is handled in server.js, so just export getDB
  return mongoose.connection.db;
}

module.exports = { getDB, connectDB };
