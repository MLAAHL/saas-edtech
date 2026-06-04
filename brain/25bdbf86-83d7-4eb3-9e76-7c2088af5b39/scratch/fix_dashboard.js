const fs = require('fs');
const filePath = 'e:\\Desktop\\new attendance\\non-teaching\\dashboard.html';
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split(/\r?\n/);
let found = false;

for (let i = 0; i < lines.length; i++) {
  if (i === 1728) { // Line 1729 (0-indexed 1728)
    console.log(`Original Line 1729: [${lines[i]}]`);
    // Construct with String.fromCharCode(96) to represent the backtick
    lines[i] = "              </div>" + String.fromCharCode(96) + ").join('');";
    console.log(`New Line 1729:      [${lines[i]}]`);
    found = true;
  }
}

if (found) {
  fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8');
  console.log('File successfully updated with the closing backtick!');
} else {
  console.log('Line index not found!');
}
