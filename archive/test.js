const fs = require('fs');
const html = fs.readFileSync('teaching/index.html', 'utf-8');
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
scripts.forEach((s, i) => {
  const code = s.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
  if (!code) return;
  try {
    require('vm').runInNewContext(code, { document: {}, window: {}, console: console, setTimeout: setTimeout });
    console.log('Script', i, 'OK');
  } catch (e) {
    if (s.includes('type="module"')) console.log('Script', i, 'is module');
    else console.error('Script', i, 'Error:', e);
  }
});
