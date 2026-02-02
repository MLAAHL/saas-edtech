// ============================================================================
// STUDENT ATTENDANCE REPORT - WITH API BASE CONFIGURATION
// ============================================================================

// ✅ API Configuration
const API_CONFIG = {
  BASE_URL: window.APP_CONFIG.API_BASE_URL,

  ENDPOINTS: {
    AVAILABLE_STREAMS: '/reports/available-streams',
    STUDENT_REPORT: '/reports/student-subject-report'
  }
};

// Helper function to build full URL
function getApiUrl(endpoint, params = '') {
  const path = params ? `${endpoint}/${params}` : endpoint;
  return `${API_CONFIG.BASE_URL}${path}`;
}

// Global variables
let currentReportData = null;
let notificationTimeout = null;
let availableStreams = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async function () {
  console.log('📊 Student Attendance Report System initialized');
  console.log('📍 Backend URL:', API_CONFIG.BASE_URL);
  addNotificationStyles();
  await loadAvailableStreams();
});

// ============================================================================
// NOTIFICATION STYLES
// ============================================================================

function addNotificationStyles() {
  if (document.getElementById('notification-styles')) return;

  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = `
    .notification-toast {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      z-index: 100000;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      pointer-events: none;
    }
    
    .notification-toast.show {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    
    .notification-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 28px;
      border-radius: 12px;
      box-shadow: 0 10px 35px rgba(34, 197, 94, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 15px;
      font-weight: 600;
      min-width: 320px;
      max-width: 500px;
      color: white;
    }
    
    .notification-content.success {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }
    
    .notification-content.error {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      box-shadow: 0 10px 35px rgba(239, 68, 68, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .notification-content.warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      box-shadow: 0 10px 35px rgba(245, 158, 11, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .notification-content.info {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      box-shadow: 0 10px 35px rgba(59, 130, 246, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .notification-icon {
      font-size: 24px;
      animation: iconPop 0.5s ease;
    }
    
    @keyframes iconPop {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// LOAD AVAILABLE STREAMS FROM DATABASE
// ============================================================================

async function loadAvailableStreams() {
  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.AVAILABLE_STREAMS);
    console.log('📚 Loading streams from:', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('📦 Streams response:', data);

    if (data.success && data.streams) {
      availableStreams = data.streams;
      populateStreamDropdown();
      console.log(`✅ Loaded ${availableStreams.length} streams from database`);
    } else {
      console.warn('⚠️ No streams found in database');
      showNotification('⚠️ No streams found in database', 'warning');
    }

  } catch (error) {
    console.error('❌ Error loading streams:', error);
    showNotification('❌ Error loading streams: ' + error.message, 'error');
  }
}

// ============================================================================
// POPULATE STREAM DROPDOWN
// ============================================================================

function populateStreamDropdown() {
  const streamSelect = document.getElementById('reportStream');
  if (!streamSelect) return;

  streamSelect.innerHTML = '<option value="">Select Academic Stream</option>';

  availableStreams.forEach(stream => {
    const option = document.createElement('option');
    option.value = stream.code || stream.name;
    option.textContent = stream.fullName || stream.name;
    streamSelect.appendChild(option);
  });

  console.log('✅ Stream dropdown populated');
}

// ============================================================================
// SHOW NOTIFICATION
// ============================================================================

function showNotification(message, type = 'success') {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }

  document.querySelectorAll('.notification-toast').forEach(n => n.remove());

  const notification = document.createElement('div');
  notification.className = 'notification-toast';

  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };

  notification.innerHTML = `
    <div class="notification-content ${type}">
      <i class="material-icons-round notification-icon">${icons[type]}</i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
  });

  notificationTimeout = setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
      notificationTimeout = null;
    }, 300);
  }, 3000);
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

async function generateReport() {
  const stream = document.getElementById('reportStream').value;
  const semester = document.getElementById('reportSemester').value;

  if (!stream || !semester) {
    showNotification('⚠️ Please select both Stream and Semester', 'warning');
    return;
  }

  const generateBtn = document.getElementById('generateBtn');
  const originalText = generateBtn.innerHTML;
  generateBtn.innerHTML = '<div class="loading-spinner"></div>Generating Report...';
  generateBtn.disabled = true;

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.STUDENT_REPORT, `${stream}/sem${semester}`);
    console.log(`📊 Generating report from:`, url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Server error' }));
      throw new Error(errorData.message || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Report response:', data);

    if (!data.success) {
      throw new Error(data.message || 'Failed to generate report');
    }

    currentReportData = data;
    displayReport(data);
    document.getElementById('reportResults').classList.remove('hidden');

    showNotification(`✅ Report generated! Found ${data.totalStudents} students`, 'success');

    setTimeout(() => {
      document.getElementById('reportResults').scrollIntoView({ behavior: 'smooth' });
    }, 300);

  } catch (error) {
    console.error('❌ Error generating report:', error);
    showNotification('❌ ' + error.message, 'error');
  } finally {
    generateBtn.innerHTML = originalText;
    generateBtn.disabled = false;
  }
}

// ============================================================================
// DISPLAY REPORT
// ============================================================================

function displayReport(data) {
  document.getElementById('reportTitle').textContent = `${data.stream} Semester ${data.semester} - Attendance Report`;
  document.getElementById('reportDate').textContent = data.reportDate || new Date().toLocaleDateString();

  displaySummaryCards(data);
  displaySubjectHeaders(data.subjects);
  displayReportTable(data);
}

// ============================================================================
// DISPLAY SUMMARY CARDS
// ============================================================================

function displaySummaryCards(data) {
  const summaryCards = document.getElementById('summaryCards');

  let totalPercentage = 0;
  let totalEntries = 0;

  data.students.forEach(student => {
    Object.values(student.subjects).forEach(subject => {
      totalPercentage += subject.percentage;
      totalEntries++;
    });
  });

  const avgAttendance = totalEntries > 0 ? (totalPercentage / totalEntries).toFixed(1) : 0;

  summaryCards.innerHTML = `
    <div class="stat-card stat-card-blue">
      <div class="stat-value">${data.totalStudents}</div>
      <div class="stat-label">Total Students</div>
    </div>
    
    <div class="stat-card stat-card-green">
      <div class="stat-value">${data.totalSubjects}</div>
      <div class="stat-label">Total Subjects</div>
    </div>
    
    <div class="stat-card stat-card-purple">
      <div class="stat-value">${avgAttendance}%</div>
      <div class="stat-label">Average Attendance</div>
    </div>
  `;
}

// ============================================================================
// DISPLAY SUBJECT HEADERS
// ============================================================================

function displaySubjectHeaders(subjects) {
  const subjectHeaders = document.getElementById('subjectHeaders');

  if (subjects.length === 0) {
    subjectHeaders.innerHTML = '<div style="grid-column: 1/-1; text-align: center; opacity: 0.7;">No subjects found</div>';
    return;
  }

  subjectHeaders.innerHTML = subjects.map(subject => `
    <div class="subject-badge">${subject}</div>
  `).join('');
}

// ============================================================================
// DISPLAY REPORT TABLE
// ============================================================================

function displayReportTable(data) {
  const tableHeader = document.getElementById('tableHeader');
  const tableBody = document.getElementById('tableBody');

  let headerHTML = `
    <th>Student ID</th>
    <th>Student Name</th>
  `;

  data.subjects.forEach(subject => {
    headerHTML += `<th class="text-center">${subject}</th>`;
  });

  tableHeader.innerHTML = headerHTML;

  let bodyHTML = '';

  if (data.students.length === 0) {
    bodyHTML = `
      <tr>
        <td colspan="${data.subjects.length + 2}" class="empty-state">
          <i class="material-icons-round">people_outline</i>
          <h3>No Students Found</h3>
          <p>No attendance data available for this stream and semester</p>
        </td>
      </tr>
    `;
  } else {
    data.students.forEach((student, index) => {
      let rowHTML = `
        <tr>
          <td style="font-weight: 600;">${student.studentID}</td>
          <td>${student.name}</td>
      `;

      data.subjects.forEach(subject => {
        const subjectData = student.subjects[subject];
        if (subjectData && subjectData.total > 0) {
          const percentage = subjectData.percentage;
          const percentageClass = percentage >= 85 ? 'percentage-excellent' :
            percentage >= 75 ? 'percentage-good' :
              'percentage-poor';

          rowHTML += `
            <td class="text-center">
              <div class="${percentageClass}">${percentage}%</div>
            </td>
          `;
        } else {
          rowHTML += `<td class="text-center" style="color: var(--grey-400);">N/A</td>`;
        }
      });

      rowHTML += '</tr>';
      bodyHTML += rowHTML;
    });
  }

  tableBody.innerHTML = bodyHTML;
}

// ============================================================================
// EXPORT TO EXCEL
// ============================================================================

function exportToExcel() {
  if (!currentReportData) {
    showNotification('❌ Please generate a report first', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const excelData = [];

  const headers = ['Student ID', 'Student Name', ...currentReportData.subjects];
  excelData.push(headers);

  currentReportData.students.forEach(student => {
    const row = [student.studentID, student.name];
    currentReportData.subjects.forEach(subject => {
      const subjectData = student.subjects[subject];
      row.push(subjectData && subjectData.total > 0 ? `${subjectData.percentage}%` : 'N/A');
    });
    excelData.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(excelData);
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');

  const filename = `Attendance_${currentReportData.stream}_S${currentReportData.semester}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);

  showNotification(`✅ Exported successfully!`, 'success');
}

// ============================================================================
// PRINT REPORT
// ============================================================================

function printReport() {
  if (!currentReportData) {
    showNotification('❌ Please generate a report first', 'error');
    return;
  }

  window.print();
  showNotification('📄 Print dialog opened', 'info');
}
