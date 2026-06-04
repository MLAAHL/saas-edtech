const fs = require('fs');
const path = require('path');
const dir = 'e:\\Desktop\\new attendance\\non-teaching';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'dashboard.html' && f !== 'index.html' && f !== 'debug.html');

files.forEach(file => {
  if (file === 'students.html') return; // Already refactored manually

  const filePath = path.join(dir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  // Skip if we already did this refactor (heuristic check)
  if (!html.includes('class="stats-grid"')) {
      // Just in case, try to replace button classes anyway
  }

  // Replace standard structural classes
  html = html.replace(/<div class="stats-grid">/g, '<div class="stats-row">');
  html = html.replace(/class="modern-btn btn-primary"/g, 'class="btn btn-primary"');
  html = html.replace(/class="modern-btn btn-success"/g, 'class="btn btn-success"');
  html = html.replace(/class="modern-btn btn-danger"/g, 'class="btn btn-danger"');
  html = html.replace(/class="modern-btn btn-text"/g, 'class="btn btn-ghost"');
  html = html.replace(/class="modern-btn/g, 'class="btn');
  html = html.replace(/class="stat-value"/g, 'class="stat-val"');
  html = html.replace(/class="action-buttons-bar"/g, 'class="card-head"');

  // Fix stat card icons (remove colors that conflict)
  html = html.replace(/<div class="stat-icon blue">/g, '<div class="stat-icon">');
  html = html.replace(/<div class="stat-icon green">/g, '<div class="stat-icon">');
  html = html.replace(/<div class="stat-icon red">/g, '<div class="stat-icon">');
  html = html.replace(/<div class="stat-icon purple">/g, '<div class="stat-icon">');
  html = html.replace(/<div class="stat-icon amber">/g, '<div class="stat-icon">');

  // In stat cards, re-order the value and label to match layout.css
  html = html.replace(/<div class="stat-info">\s*<div class="stat-val"([^>]*)>(.*?)<\/div>\s*<div class="stat-label">(.*?)<\/div>\s*<\/div>/g, '<div class="stat-info"><div class="stat-label">$3</div><div class="stat-val"$1>$2</div></div>');

  // For other files, we should also replace their huge style blocks with the minimal tableStyles, because they all share the same table layout
  const tableStyles = `
  <style>
    .filters-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .filter-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .filter-select, .filter-input {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
    }
    .modern-table-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow-x: auto;
    }
    .modern-table {
      width: 100%;
      border-collapse: collapse;
    }
    .modern-table th {
      background: var(--bg-elevated);
      padding: 12px 16px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    .modern-table td {
      padding: 14px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    .tabs-container {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 10px;
      margin-bottom: 20px;
      width: fit-content;
    }
    .tab-btn {
      padding: 8px 18px;
      background: transparent;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tab-btn.active {
      background: var(--bg-elevated);
      color: var(--text-primary);
    }
    .bulk-actions-bar {
      display: none;
      background: var(--purple-dim);
      border: 1px solid var(--purple);
      border-radius: 12px;
      padding: 12px 20px;
      margin-bottom: 16px;
      align-items: center;
      justify-content: space-between;
    }
    .bulk-actions-bar.active {
      display: flex;
    }
    .status-badge {
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
    }
    .status-badge.active { background: var(--green-dim); color: var(--green); }
    .status-badge.inactive { background: var(--red-dim); color: var(--red); }
  </style>
`;
  html = html.replace(/<style>[\s\S]*?<\/style>/, tableStyles);

  fs.writeFileSync(filePath, html);
  console.log('Processed:', file);
});
