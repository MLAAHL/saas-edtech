const fs = require('fs');
const content = fs.readFileSync('e:\\Desktop\\new attendance\\non-teaching\\dashboard.html', 'utf8');
const lines = content.split('\n');
for (let i = 1718; i <= 1731; i++) {
  console.log(`${i + 1}: ${lines[i]} -> ${JSON.stringify(lines[i])}`);
}
