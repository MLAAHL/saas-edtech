const fs = require('fs');
const path = require('path');
const dir = 'e:\\Desktop\\new attendance\\non-teaching';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'dashboard.html' && f !== 'index.html' && f !== 'debug.html');

const linksToInject = `  <!-- Shared CSS -->
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/profile.css">
</head>`;

const sidebarReplacer = `  <aside class="sidebar">
    <div class="sb-logo">
      <img src="logo.png" alt="MLAAHL Logo">
    </div>

    <div class="sb-group">
      <a href="dashboard.html" class="sb-link">
        <span class="material-symbols-rounded">dashboard</span> Dashboard
      </a>
      <a href="students.html" class="sb-link">
        <span class="material-symbols-rounded">group</span> Students
      </a>
      <a href="report.html" class="sb-link">
        <span class="material-symbols-rounded">description</span> Reports
      </a>
      <a href="view-attendance.html" class="sb-link">
        <span class="material-symbols-rounded">assignment</span> View Attendance
      </a>
      <a href="promotion.html" class="sb-link">
        <span class="material-symbols-rounded">trending_up</span> Promote
      </a>
    </div>

    <div class="sb-divider"></div>

    <div class="sb-group">
      <a href="ai-assistant.html" class="sb-link">
        <span class="material-symbols-rounded">auto_awesome</span> AI Assistant
      </a>
      <a href="teachers.html" class="sb-link">
        <span class="material-symbols-rounded">badge</span> Teachers
      </a>
      <a href="parents-status.html" class="sb-link">
        <span class="material-symbols-rounded">notifications</span> Parent Status
      </a>
    </div>

    <div class="sb-divider"></div>

    <div class="sb-group">
      <a href="mentorship.html" class="sb-link">
        <span class="material-symbols-rounded">school</span> Mentors
      </a>
    </div>

    <div class="sb-section-label">
      Quick Stats
    </div>
    <div class="sb-team-item">
      <div class="sb-team-avatar" style="background:var(--green-dim);color:var(--green);">P</div>
      <div class="sb-team-name" id="sbPresent">Present Today</div>
      <div class="sb-team-status">
        <div class="sb-team-dot active"></div>
        <div class="sb-team-dot active"></div>
        <div class="sb-team-dot"></div>
      </div>
    </div>
    <div class="sb-team-item">
      <div class="sb-team-avatar" style="background:var(--red-dim);color:var(--red);">A</div>
      <div class="sb-team-name" id="sbAbsent">Absent Today</div>
      <div class="sb-team-status">
        <div class="sb-team-dot active" style="background:var(--red);"></div>
        <div class="sb-team-dot" style="background:var(--red);"></div>
      </div>
    </div>

    <div class="sb-bottom">
      <button class="sb-logout" id="logoutBtn">
        <span class="material-symbols-rounded">logout</span> Log Out
      </button>
    </div>
  </aside>`;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Ensure we haven't already injected the CSS links to avoid duplicates
  if (!content.includes('css/base.css')) {
    content = content.replace(/<\/head>/, linksToInject);
  }

  // Replace sidebar (using a robust regex that matches across multiple lines)
  content = content.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, sidebarReplacer);

  // Auto-highlight active link in sidebar
  const pageName = file;
  content = content.replace(new RegExp('<a href="' + pageName + '" class="sb-link">', 'g'), '<a href="' + pageName + '" class="sb-link active">');

  fs.writeFileSync(filePath, content);
  console.log('Processed:', file);
});
