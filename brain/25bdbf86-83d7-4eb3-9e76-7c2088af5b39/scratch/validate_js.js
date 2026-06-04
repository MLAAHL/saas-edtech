const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('e:\\Desktop\\new attendance\\non-teaching\\dashboard.html', 'utf8');

// Find all script tags
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let index = 1;
let hasError = false;

while ((match = scriptRegex.exec(html)) !== null) {
  let jsCode = match[1];
  if (!jsCode.trim()) continue;
  
  // Strip import statements completely
  jsCode = jsCode.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');
  
  try {
    new vm.Script(jsCode);
    console.log(`Script tag #${index} syntax is valid!`);
  } catch (e) {
    console.error(`Syntax Error found in Script tag #${index}:`);
    console.error(e.message);
    console.error(e.stack);
    hasError = true;
  }
  index++;
}

if (!hasError) {
  console.log('All Script tags are syntactically valid!');
}
