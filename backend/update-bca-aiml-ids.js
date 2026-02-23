require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/student');

// BCA AI & ML Sem 2 ID updates from the image
const idUpdates = [
  { name: 'AATIKA NIKKHATH A', newId: 'U18ER25S0031' },
  { name: 'AMRUTHA K U', newId: 'U18ER25S0032' },
  { name: 'AMRUTHA. C', newId: 'U18ER25S0033' },
  { name: 'B POOJA', newId: 'U18ER25S0034' },
  { name: 'BHOOMIKA IYENGAR R', newId: 'U18ER25S0035' },
  { name: 'DARSHAN N', newId: 'U18ER25S0036' },
  { name: 'DEEKSHITHA C', newId: 'U18ER25S0037' },
  { name: 'DEEKSHITHA N', newId: 'U18ER25S0038' },
  { name: 'DEEPAK R', newId: 'U18ER25S0039' },
  { name: 'GANGOTHRI R', newId: 'U18ER25S0040' },
  { name: 'GOPIKA', newId: 'U18ER25S0041' },
  { name: 'GOWRI DASAR', newId: 'U18ER25S0042' },
  { name: 'GRISHMA P M', newId: 'U18ER25S0043' },
  { name: 'HARSHITHA.U', newId: 'U18ER25S0044' },
  { name: 'HASHWIN S', newId: 'U18ER25S0045' },
  { name: 'HASINI S', newId: 'U18ER25S0046' },
  { name: 'INDU M', newId: 'U18ER25S0047' },
  { name: 'JANIKA PRAKASH', newId: 'U18ER25S0048' },
  { name: 'JYOTHI K', newId: 'U18ER25S0049' },
  { name: 'KEERTHANA S', newId: 'U18ER25S0050' },
  { name: 'KIRAN S', newId: 'U18ER25S0051' },
  { name: 'LAKSHMI G', newId: 'U18ER25S0052' },
  { name: 'LAVANYA N', newId: 'U18ER25S0053' },
  { name: 'LAYA', newId: 'U18ER25S0054' },
  { name: 'MADHUMITHA V', newId: 'U18ER25S0055' },
  { name: 'MAMTA KUMARI', newId: 'U18ER25S0056' },
  { name: 'MARK STEVAN', newId: 'U18ER25S0057' },
  { name: 'NIKHIL V', newId: 'U18ER25S0058' },
  { name: 'NIRUPAMA H S', newId: 'U18ER25S0059' },
  { name: 'PAVITHRA S', newId: 'U18ER25S0060' },
  { name: 'PRINCY CHRYSOLITE D', newId: 'U18ER25S0061' },
  { name: 'RADHIKA', newId: 'U18ER25S0062' },
  { name: 'RAHUL RAJ', newId: 'U18ER25S0063' },
  { name: 'RAKSHITHA S', newId: 'U18ER25S0064' },
  { name: 'REKHASHREE R', newId: 'U18ER25S0065' },
  { name: 'ROHITH K', newId: 'U18ER25S0066' },
  { name: 'SAHANA S', newId: 'U18ER25S0067' },
  { name: 'SHASHANK V', newId: 'U18ER25S0068' },
  { name: 'SHRAVANI S', newId: 'U18ER25S0069' },
  { name: 'SHREYAS D', newId: 'U18ER25S0070' },
  { name: 'SHREYAS S', newId: 'U18ER25S0071' },
  { name: 'SNEHA K M', newId: 'U18ER25S0072' },
  { name: 'SRI RAMANA R', newId: 'U18ER25S0073' },
  { name: 'SWASTHIK P L', newId: 'U18ER25S0074' },
  { name: 'VARSHITA Y', newId: 'U18ER25S0075' },
  { name: 'VISHAL K', newId: 'U18ER25S0076' },
  { name: 'YASHASWINI P', newId: 'U18ER25S0077' },
  { name: 'YASHASWINI V', newId: 'U18ER25S0078' }
];

// Name matching variations
const nameVariations = {
  'AATIKA NIKKHATH A': ['A AATIKA NIKKHATH', 'AATIKA NIKKHATH A', 'AATIKA NIKKHATH'],
  'AMRUTHA. C': ['AMRUTHA C', 'AMRUTHA. C'],
  'BHOOMIKA IYENGAR R': ['BHOOMIKA IYENGAR A', 'BHOOMIKA IYENGAR R'],
  'GOPIKA': ['GOPIKA A', 'GOPIKA'],
  'HARSHITHA.U': ['HARSHITHA U', 'HARSHITHA.U'],
  'MARK STEVAN': ['MARK STEEVAN A', 'MARK STEVAN', 'MARK STEEVAN'],
  'SAHANA S': ['SAHANA S']
};

async function updateIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Updating BCA AI & ML Sem 2 student IDs...\n');
    
    let updated = 0;
    const notFound = [];
    
    for (const { name, newId } of idUpdates) {
      // Try exact match first
      let result = await Student.findOneAndUpdate(
        { stream: 'BCA AI & ML', semester: 2, name: name },
        { $set: { studentID: newId } },
        { new: true }
      );
      
      // Try variations if exact match fails
      if (!result && nameVariations[name]) {
        for (const variation of nameVariations[name]) {
          result = await Student.findOneAndUpdate(
            { stream: 'BCA AI & ML', semester: 2, name: variation },
            { $set: { studentID: newId } },
            { new: true }
          );
          if (result) break;
        }
      }
      
      // Try case-insensitive regex match
      if (!result) {
        const searchName = name.replace(/\./g, '').replace(/\s+/g, ' ').trim();
        result = await Student.findOneAndUpdate(
          { 
            stream: 'BCA AI & ML', 
            semester: 2, 
            name: { $regex: new RegExp('^' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s*'), 'i') }
          },
          { $set: { studentID: newId } },
          { new: true }
        );
      }
      
      if (result) {
        console.log(`✅ ${result.name} -> ${newId}`);
        updated++;
      } else {
        notFound.push(name);
      }
    }
    
    console.log('\n========== SUMMARY ==========');
    console.log(`Updated: ${updated} students`);
    if (notFound.length > 0) {
      console.log(`Not found: ${notFound.join(', ')}`);
    }
    
    // Show final list
    console.log('\n========== FINAL LIST ==========');
    const students = await Student.find({ stream: 'BCA AI & ML', semester: 2 })
      .sort({ studentID: 1 });
    students.forEach(s => console.log(`${s.studentID || 'NO ID'} - ${s.name}`));
    console.log('Total:', students.length);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateIds();
