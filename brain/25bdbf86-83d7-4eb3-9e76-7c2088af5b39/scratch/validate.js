const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('e:\\Desktop\\new attendance\\non-teaching\\dashboard.html', 'utf8');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match, index = 1;

while ((match = scriptRegex.exec(html)) !== null) {
  let jsCode = match[1];
  if (!jsCode.trim()) continue;
  
  // Clean up import statements so Node compiler doesn't fail on them
  jsCode = jsCode.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  
  try {
    new vm.Script(jsCode);
    console.log(`Script tag #${index} syntax is valid!`);
  } catch (e) {
    console.error(`Syntax Error in Script tag #${index}: ${e.message}`);
    console.error(e.stack);
  }
  index++;
}
