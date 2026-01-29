const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
console.log('🔧 API Base URL:', API_BASE_URL);

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let currentStream = '';
let currentSemester = '';
let currentSubject = '';
let currentViewMode = 'full';
let currentDate = '';
let registerData = null;
let isEditMode = false;
let originalData = null;
let currentDateData = null;
let selectedSessions = new Set();

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

function showNotification(message, type = 'info') {
  const config = {
    success: {
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      icon: 'check_circle',
      shadow: 'rgba(16, 185, 129, 0.25)'
    },
    error: {
      gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
      icon: 'error',
      shadow: 'rgba(239, 68, 68, 0.25)'
    },
    warning: {
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      icon: 'warning',
      shadow: 'rgba(245, 158, 11, 0.25)'
    },
    info: {
      gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
      icon: 'info',
      shadow: 'rgba(99, 102, 241, 0.25)'
    }
  };

  const style = config[type] || config.info;

  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-radius: 12px;
    padding: 14px 18px;
    box-shadow: 0 8px 32px ${style.shadow}, 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 380px;
    min-width: 280px;
    font-family: 'Poppins', sans-serif;
    animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid rgba(0, 0, 0, 0.05);
  `;

  notification.innerHTML = `
    <div style="
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: ${style.gradient};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    ">
      <span class="material-symbols-rounded" style="
        font-size: 20px;
        color: white;
        font-variation-settings: 'FILL' 1;
      ">${style.icon}</span>
    </div>
    <span style="
      flex: 1;
      font-size: 14px;
      font-weight: 600;
      color: #1E293B;
      line-height: 1.4;
    ">${message}</span>
    <button onclick="this.parentElement.remove()" style="
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #F8FAFC;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    " onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F8FAFC'">
      <span class="material-symbols-rounded" style="font-size: 16px; color: #64748B;">close</span>
    </button>
  `;

  if (!document.getElementById('notification-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-animations';
    styleSheet.textContent = `
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(100px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideOutRight {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100px); }
      }
      @media (max-width: 768px) {
        @keyframes slideInRight {
          from { opacity: 0; transform: translateY(-50px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-50px); }
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  if (window.innerWidth <= 768) {
    notification.style.top = '80px';
    notification.style.left = '50%';
    notification.style.right = 'auto';
    notification.style.transform = 'translateX(-50%)';
    notification.style.maxWidth = 'calc(100% - 32px)';
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

function showConfirm(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 99998;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 24px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  dialog.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
      <div style="
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: linear-gradient(135deg, #F59E0B, #D97706);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      ">
        <span class="material-symbols-rounded" style="
          font-size: 28px;
          color: white;
          font-variation-settings: 'FILL' 1;
        ">help</span>
      </div>
      <div style="flex: 1;">
        <h3 style="
          font-size: 18px;
          font-weight: 700;
          color: #1E293B;
          margin-bottom: 8px;
          font-family: 'Poppins', sans-serif;
        ">Confirm Action</h3>
        <p style="
          font-size: 14px;
          color: #64748B;
          line-height: 1.6;
          font-family: 'Poppins', sans-serif;
        ">${message}</p>
      </div>
    </div>
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="cancelBtn" style="
        padding: 10px 20px;
        border-radius: 10px;
        font-weight: 600;
        font-size: 14px;
        border: 1px solid #E2E8F0;
        background: white;
        color: #64748B;
        cursor: pointer;
        font-family: 'Poppins', sans-serif;
        transition: all 0.2s;
      ">Cancel</button>
      <button id="confirmBtn" style="
        padding: 10px 20px;
        border-radius: 10px;
        font-weight: 600;
        font-size: 14px;
        border: none;
        background: linear-gradient(135deg, #EF4444, #DC2626);
        color: white;
        cursor: pointer;
        font-family: 'Poppins', sans-serif;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        transition: all 0.2s;
      ">Confirm</button>
    </div>
  `;

  if (!document.getElementById('dialog-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dialog-animations';
    styleSheet.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const confirmBtn = dialog.querySelector('#confirmBtn');
  const cancelBtn = dialog.querySelector('#cancelBtn');

  confirmBtn.addEventListener('mouseover', () => {
    confirmBtn.style.transform = 'translateY(-1px)';
    confirmBtn.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
  });

  confirmBtn.addEventListener('mouseout', () => {
    confirmBtn.style.transform = 'translateY(0)';
    confirmBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
  });

  cancelBtn.addEventListener('mouseover', () => {
    cancelBtn.style.background = '#F8FAFC';
  });

  cancelBtn.addEventListener('mouseout', () => {
    cancelBtn.style.background = 'white';
  });

  confirmBtn.onclick = () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  };

  cancelBtn.onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onCancel) onCancel();
    }
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 View Attendance initialized');

  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }

  await loadStreams();
  setupEventListeners();

  setTimeout(() => restoreState(), 500);
});

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

function saveState() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');

  const state = {
    stream: streamSelect.value,
    semester: semesterSelect.value,
    subject: subjectSelect.value,
    timestamp: Date.now()
  };

  localStorage.setItem('attendanceViewState', JSON.stringify(state));
  console.log('💾 State saved:', state);
}

async function restoreState() {
  try {
    const savedState = localStorage.getItem('attendanceViewState');

    if (!savedState) {
      console.log('ℹ️ No saved state found');
      return;
    }

    const state = JSON.parse(savedState);
    console.log('📥 Restoring state:', state);

    if (!state.stream || !state.semester || !state.subject) {
      console.log('⚠️ Incomplete state data');
      return;
    }

    const streamSelect = document.getElementById('streamSelect');
    const semesterSelect = document.getElementById('semesterSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    const specificDateInput = document.getElementById('specificDateInput');

    streamSelect.value = state.stream;
    currentStream = state.stream;

    await loadSemesters(state.stream);
    await sleep(150);
    semesterSelect.value = state.semester;
    currentSemester = state.semester;

    await loadSubjects(state.stream, state.semester);
    await sleep(150);
    subjectSelect.value = state.subject;
    currentSubject = state.subject;

    console.log('✅ State restored successfully');
    await sleep(200);

    // Load the register first
    await loadRegister();

    // Check if we should switch to single date view (from History navigation)
    if (state.viewMode === 'single' && state.date) {
      console.log('📅 Switching to single date view for:', state.date);
      await sleep(200);

      // Set the date input value
      if (specificDateInput) {
        specificDateInput.value = state.date;
      }

      // Switch to single date view
      switchViewMode('single');

      // Load the single date data
      await sleep(200);
      loadSingleDateView();

      // Clear the state after use to prevent re-loading on refresh
      localStorage.removeItem('attendanceViewState');
    }

  } catch (error) {
    console.error('❌ Error restoring state:', error);
    localStorage.removeItem('attendanceViewState');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

async function loadStreams() {
  const streamSelect = document.getElementById('streamSelect');

  try {
    streamSelect.innerHTML = '<option value="">Loading... </option>';

    const url = `${API_BASE_URL}/streams`;
    console.log('🔗 Fetching from URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Streams API response:', data);

    // 🔍 DEBUG: Log exactly what we're getting
    if (data.streams) {
      console.log('📋 Raw streams data:', JSON.stringify(data.streams, null, 2));
      data.streams.forEach((s, i) => {
        console.log(`Stream ${i}:`, s, '| Type:', typeof s, '| Is null:', s === null);
      });
    }

    streamSelect.innerHTML = '<option value="">-- Select Stream --</option>';

    if (data.success && Array.isArray(data.streams) && data.streams.length > 0) {
      let validStreamCount = 0;

      data.streams.forEach((stream, index) => {
        // 🔍 DEBUG: Log each stream before processing
        console.log(`Processing stream ${index}:`, stream, typeof stream);

        // ✅ FIX: Handle all possible invalid cases
        if (stream === null || stream === undefined) {
          console.warn(`⚠️ Skipping null/undefined stream at index ${index}`);
          return;
        }

        // ✅ FIX:  If stream is an object, try to extract the name/value
        let streamValue = stream;
        if (typeof stream === 'object') {
          // Try common property names
          streamValue = stream.name || stream.streamName || stream.value || stream.stream || stream._id || String(stream);
          console.log(`📦 Stream is object, extracted value: ${streamValue}`);
        }

        // ✅ FIX: Convert to string safely
        if (typeof streamValue !== 'string') {
          streamValue = String(streamValue);
        }

        // ✅ FIX: Skip empty strings
        if (streamValue.trim() === '' || streamValue === 'null' || streamValue === 'undefined' || streamValue === '[object Object]') {
          console.warn(`⚠️ Skipping invalid stream value:  "${streamValue}" at index ${index}`);
          return;
        }

        const option = document.createElement('option');
        option.value = streamValue;
        option.textContent = streamValue.toUpperCase();
        streamSelect.appendChild(option);
        validStreamCount++;
      });

      if (validStreamCount > 0) {
        console.log(`✅ Loaded ${validStreamCount} valid streams from database`);
      } else {
        throw new Error('No valid streams found in response');
      }
    } else {
      throw new Error('No streams found in response');
    }

  } catch (error) {
    console.error('❌ Error loading streams from database:', error);
    streamSelect.innerHTML = '<option value="">-- No Streams Available --</option>';
    showNotification('Could not load streams from database', 'error');
  }
}

async function loadSemesters(stream) {
  const semesterSelect = document.getElementById('semesterSelect');

  try {
    semesterSelect.innerHTML = '<option value="">Loading...</option>';
    semesterSelect.disabled = true;

    if (!stream) {
      semesterSelect.innerHTML = '<option value="">Select stream first</option>';
      return;
    }

    console.log('📡 Fetching semesters for stream:', stream);

    const response = await fetch(`${API_BASE_URL}/streams/${encodeURIComponent(stream)}/semesters`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Semesters API response:', data);

    semesterSelect.innerHTML = '<option value="">-- Select Semester --</option>';

    if (data.success && Array.isArray(data.semesters) && data.semesters.length > 0) {
      data.semesters.forEach(semester => {
        const option = document.createElement('option');
        option.value = semester;
        option.textContent = `Semester ${semester}`;
        semesterSelect.appendChild(option);
      });
      semesterSelect.disabled = false;
      console.log(`✅ Loaded ${data.semesters.length} semesters`);
    } else {
      throw new Error('No semesters found');
    }

  } catch (error) {
    console.error('❌ Error loading semesters:', error);
    semesterSelect.innerHTML = '<option value="">No semesters found</option>';
    semesterSelect.disabled = true;
    showNotification('Failed to load semesters', 'error');
  }
}

async function loadSubjects(stream, semester) {
  const subjectSelect = document.getElementById('subjectSelect');

  try {
    subjectSelect.innerHTML = '<option value="">Loading...</option>';
    subjectSelect.disabled = true;

    if (!stream || !semester) {
      subjectSelect.innerHTML = '<option value="">Select stream & semester first</option>';
      return;
    }

    console.log('📡 Fetching subjects for:', { stream, semester });

    // ✅ FIXED - Correct endpoint
    const response = await fetch(`${API_BASE_URL}/subjects/${encodeURIComponent(stream)}/sem${semester}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Subjects API response:', data);

    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';

    if (data.success && data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0) {
      data.subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.name || subject.subjectName;
        option.textContent = subject.name || subject.subjectName;
        subjectSelect.appendChild(option);
      });

      subjectSelect.disabled = false;
      console.log(`✅ Loaded ${data.subjects.length} subjects`);
    } else {
      subjectSelect.innerHTML = '<option value="">No subjects found</option>';
      console.warn('⚠️ No subjects found for:', { stream, semester });
    }

  } catch (error) {
    console.error('❌ Error loading subjects:', error);
    subjectSelect.innerHTML = '<option value="">No subjects found</option>';
    subjectSelect.disabled = true;
    showNotification('Failed to load subjects', 'error');
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  const loadRegisterBtn = document.getElementById('loadRegisterBtn');
  const registerTable = document.getElementById('registerTable');
  const fullRegisterBtn = document.getElementById('fullRegisterBtn');
  const singleDateBtn = document.getElementById('singleDateBtn');
  const specificDateInput = document.getElementById('specificDateInput');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  const studentSearchInput = document.getElementById('studentSearchInput');
  const attendanceStats = document.getElementById('attendanceStats');

  streamSelect.addEventListener('change', async () => {
    const stream = streamSelect.value;
    currentStream = stream;
    await loadSemesters(stream);
    registerTable.classList.add('hidden');
    if (attendanceStats) {
      attendanceStats.classList.add('hidden');
    }
    saveState();
  });

  semesterSelect.addEventListener('change', async () => {
    const stream = streamSelect.value;
    const semester = semesterSelect.value;
    currentSemester = semester;
    await loadSubjects(stream, semester);
    registerTable.classList.add('hidden');
    if (attendanceStats) {
      attendanceStats.classList.add('hidden');
    }
    saveState();
  });

  subjectSelect.addEventListener('change', () => {
    currentSubject = subjectSelect.value;
    saveState();
  });

  loadRegisterBtn.addEventListener('click', loadRegister);
  fullRegisterBtn.addEventListener('click', () => switchViewMode('full'));

  singleDateBtn.addEventListener('click', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;

    specificDateInput.value = todayFormatted;
    switchViewMode('single');
  });

  specificDateInput.addEventListener('change', () => {
    if (currentViewMode === 'single' && specificDateInput.value) {
      loadSingleDateView();
    }
  });

  editAttendanceBtn.addEventListener('click', enableEditMode);
  saveAttendanceBtn.addEventListener('click', saveAttendance);
  cancelEditBtn.addEventListener('click', cancelEdit);

  if (deleteAttendanceBtn) {
    deleteAttendanceBtn.addEventListener('click', deleteAttendance);
  }

  if (deleteSessionBtn) {
    deleteSessionBtn.addEventListener('click', deleteSelectedSessions);
  }

  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', performSearch);
  }
}

// ============================================================================
// LOAD REGISTER
// ============================================================================

async function loadRegister() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  const registerTable = document.getElementById('registerTable');
  const searchContainer = document.getElementById('searchContainer');

  const stream = streamSelect.value;
  const semester = semesterSelect.value;
  const subject = subjectSelect.value;

  if (!stream || !semester || !subject) {
    showNotification('Please select stream, semester, and subject', 'warning');
    return;
  }

  currentStream = stream;
  currentSemester = semester;
  currentSubject = subject;

  saveState();

  try {
    showLoadingState();

    const response = await fetch(`${API_BASE_URL}/attendance/register/${stream}/sem${semester}/${encodeURIComponent(subject)}`);
    const data = await response.json();

    console.log('📦 Register data received:', data);

    if (data.success) {
      registerData = data;
      registerTable.classList.remove('hidden');

      currentViewMode = 'full';
      switchViewMode('full');

      updateStats();

      if (searchContainer) {
        searchContainer.classList.remove('hidden');
      }

      showNotification('Register loaded successfully', 'success');
    } else {
      showNotification('Failed to load register: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('❌ Error loading register:', error);
    showNotification('Error loading register: ' + error.message, 'error');
  }
}

// ============================================================================
// LOAD SINGLE DATE VIEW
// ============================================================================

async function loadSingleDateView() {
  const specificDateInput = document.getElementById('specificDateInput');
  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');

  const selectedDate = specificDateInput.value;

  if (!selectedDate) {
    showNotification('Please select a date', 'warning');
    return;
  }

  if (!currentStream || !currentSemester || !currentSubject) {
    showNotification('Please load register first', 'warning');
    return;
  }

  currentDate = selectedDate;

  try {
    showLoadingState();

    const response = await fetch(`${API_BASE_URL}/attendance/date/${currentStream}/sem${currentSemester}/${encodeURIComponent(currentSubject)}/${selectedDate}`);
    const data = await response.json();

    console.log('📅 Single date data:', data);

    if (data.success && data.sessions && data.sessions.length > 0) {
      currentDateData = data;
      displaySingleDate(data);

      if (editAttendanceBtn) editAttendanceBtn.classList.remove('hidden');
      if (deleteAttendanceBtn) deleteAttendanceBtn.classList.remove('hidden');
      if (exportExcelBtn) exportExcelBtn.classList.add('hidden');
    } else {
      viewThead.innerHTML = '';
      viewTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 60px;">
            <span class="material-symbols-rounded" style="font-size: 48px; color: #9CA3AF; display: block; margin-bottom: 16px;">event_busy</span>
            <p style="color: #6b7280; font-size: 14px;">No attendance records found for ${selectedDate}</p>
          </td>
        </tr>
      `;

      if (editAttendanceBtn) editAttendanceBtn.classList.add('hidden');
      if (deleteAttendanceBtn) deleteAttendanceBtn.classList.add('hidden');
      if (exportExcelBtn) exportExcelBtn.classList.add('hidden');
      currentDateData = null;
    }

  } catch (error) {
    console.error('❌ Error loading single date:', error);
    showNotification('Error loading date: ' + error.message, 'error');
  }
}

// ============================================================================
// VIEW MODES
// ============================================================================

function switchViewMode(mode) {
  const fullRegisterBtn = document.getElementById('fullRegisterBtn');
  const singleDateBtn = document.getElementById('singleDateBtn');
  const dateSelector = document.getElementById('dateSelector');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');

  currentViewMode = mode;

  if (isEditMode) {
    cancelEdit();
  }
  selectedSessions.clear();

  if (mode === 'full') {
    if (fullRegisterBtn) fullRegisterBtn.classList.add('active');
    if (singleDateBtn) singleDateBtn.classList.remove('active');
    if (dateSelector) dateSelector.classList.add('hidden');
    if (deleteAttendanceBtn) deleteAttendanceBtn.classList.add('hidden');
    if (deleteSessionBtn) deleteSessionBtn.classList.add('hidden');
    if (saveAttendanceBtn) saveAttendanceBtn.classList.add('hidden');
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');

    if (registerData) {
      displayFullRegister();
      if (exportExcelBtn) exportExcelBtn.classList.remove('hidden');
      if (editAttendanceBtn) editAttendanceBtn.classList.remove('hidden');
    }
  } else {
    if (fullRegisterBtn) fullRegisterBtn.classList.remove('active');
    if (singleDateBtn) singleDateBtn.classList.add('active');
    if (dateSelector) dateSelector.classList.remove('hidden');
    if (deleteSessionBtn) deleteSessionBtn.classList.add('hidden');
    if (exportExcelBtn) exportExcelBtn.classList.add('hidden');

    if (registerData) {
      loadSingleDateView();
    }
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayFullRegister() {
  if (!registerData) return;

  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const searchContainer = document.getElementById('searchContainer');

  selectedSessions.clear();
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  if (deleteSessionBtn) {
    deleteSessionBtn.classList.add('hidden');
  }

  let headerHTML = '<tr>';
  headerHTML += '<th>#</th>';
  headerHTML += '<th>Student ID</th>';
  headerHTML += '<th>Name</th>';

  registerData.sessions.forEach((session, index) => {
    const date = new Date(session.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    headerHTML += `
      <th class="session-header" data-session-id="${session._id}" data-session-index="${index}" style="text-align: center;">
        <div>
          <span class="session-header-checkbox"></span>
          <div class="time-badge">${session.time}</div>
          <div style="font-size: 10px; margin-top: 4px; font-weight: 500; color: #6b7280;">${date}</div>
        </div>
      </th>
    `;
  });

  headerHTML += '<th style="text-align: center;">Present</th>';
  headerHTML += '<th style="text-align: center;">Absent</th>';
  headerHTML += '<th style="text-align: center;">%</th>';
  headerHTML += '</tr>';

  viewThead.innerHTML = headerHTML;

  const sessionHeaders = viewThead.querySelectorAll('.session-header');
  sessionHeaders.forEach(header => {
    header.addEventListener('click', () => toggleSessionSelection(header));
  });

  let bodyHTML = '';
  registerData.students.forEach((student, index) => {
    bodyHTML += '<tr>';
    bodyHTML += `<td>${index + 1}</td>`;
    bodyHTML += `<td style="font-family: monospace;">${student.studentID}</td>`;
    bodyHTML += `<td>${student.name}</td>`;

    student.attendance.forEach((att, attIndex) => {
      const chipClass = att.status === 'P' ? 'chip-present' : 'chip-absent';
      const sessionId = att.sessionId || registerData.sessions[attIndex]?._id || '';

      bodyHTML += `
        <td style="text-align: center;">
          <span class="status-chip ${chipClass}"
                data-student="${student.studentID}"
                data-session="${sessionId}">${att.status}</span>
        </td>
      `;
    });

    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #22C55E">${student.presentCount}</td>`;
    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #EF4444">${student.absentCount}</td>`;
    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #6366F1">${student.attendancePercentage}%</td>`;
    bodyHTML += '</tr>';
  });

  viewTbody.innerHTML = bodyHTML;
  exportExcelBtn.classList.remove('hidden');
  editAttendanceBtn.classList.remove('hidden');

  if (searchContainer) {
    searchContainer.classList.remove('hidden');
  }

  updateStats();
}

function toggleSessionSelection(headerElement) {
  const sessionId = headerElement.dataset.sessionId;

  if (selectedSessions.has(sessionId)) {
    selectedSessions.delete(sessionId);
    headerElement.classList.remove('selected');
  } else {
    selectedSessions.add(sessionId);
    headerElement.classList.add('selected');
  }

  console.log('📌 Selected sessions:', Array.from(selectedSessions));

  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  if (selectedSessions.size > 0) {
    deleteSessionBtn.classList.remove('hidden');
  } else {
    deleteSessionBtn.classList.add('hidden');
  }
}

async function deleteSelectedSessions() {
  if (selectedSessions.size === 0) {
    showNotification('Please select sessions to delete by clicking on the session headers', 'warning');
    return;
  }

  const sessionCount = selectedSessions.size;
  const message = `Are you sure you want to delete ${sessionCount} session${sessionCount > 1 ? 's' : ''}? This will permanently remove attendance data for all students in ${sessionCount > 1 ? 'these sessions' : 'this session'}.`;

  showConfirm(message, async () => {
    try {
      console.log('🗑️ Deleting sessions:', Array.from(selectedSessions));

      const deleteSessionBtn = document.getElementById('deleteSessionBtn');
      const originalHTML = deleteSessionBtn.innerHTML;
      deleteSessionBtn.disabled = true;
      deleteSessionBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">hourglass_empty</span> Deleting...';

      const deletePromises = Array.from(selectedSessions).map(sessionId =>
        fetch(`${API_BASE_URL}/attendance/${sessionId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      const results = await Promise.all(deletePromises);
      const successCount = results.filter(r => r.ok).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        showNotification(`Successfully deleted ${successCount} session${successCount > 1 ? 's' : ''}!`, 'success');

        selectedSessions.clear();
        deleteSessionBtn.classList.add('hidden');
        await loadRegister();
      } else {
        showNotification(`Deleted ${successCount} sessions successfully. ${failCount} session${failCount > 1 ? 's' : ''} failed to delete.`, 'warning');
        selectedSessions.clear();
        await loadRegister();
      }

    } catch (error) {
      console.error('❌ Error deleting sessions:', error);
      showNotification('Error deleting sessions: ' + error.message, 'error');

      const deleteSessionBtn = document.getElementById('deleteSessionBtn');
      deleteSessionBtn.disabled = false;
      deleteSessionBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">delete_sweep</span> Delete Sessions';
    }
  });
}

function displaySingleDate(data) {
  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');

  let headerHTML = '<tr>';
  headerHTML += '<th>#</th>';
  headerHTML += '<th>Student ID</th>';
  headerHTML += '<th>Name</th>';

  data.sessions.forEach(session => {
    headerHTML += `
      <th style="text-align: center;">
        <div class="time-badge">${session.time}</div>
      </th>
    `;
  });

  headerHTML += '</tr>';
  viewThead.innerHTML = headerHTML;

  let bodyHTML = '';
  data.students.forEach((student, index) => {
    bodyHTML += '<tr>';
    bodyHTML += `<td>${index + 1}</td>`;
    bodyHTML += `<td style="font-family: monospace;">${student.studentID}</td>`;
    bodyHTML += `<td>${student.name}</td>`;

    student.sessions.forEach(session => {
      const chipClass = session.status === 'P' ? 'chip-present' : 'chip-absent';
      bodyHTML += `
        <td style="text-align: center;">
          <span class="status-chip ${chipClass}" 
                data-student="${student.studentID}" 
                data-session="${session.sessionId}">${session.status}</span>
        </td>
      `;
    });

    bodyHTML += '</tr>';
  });

  viewTbody.innerHTML = bodyHTML;
}

// ============================================================================
// STATISTICS
// ============================================================================

function updateStats() {
  if (!registerData) {
    console.warn('⚠️ No register data available');
    return;
  }

  const attendanceStats = document.getElementById('attendanceStats');
  const totalSessionsEl = document.getElementById('totalSessions');
  const totalStudentsEl = document.getElementById('totalStudents');

  if (!attendanceStats || !totalSessionsEl || !totalStudentsEl) {
    console.error('❌ Stats elements not found');
    return;
  }

  const totalSessions = registerData.totalSessions || 0;
  const totalStudents = registerData.totalStudents || 0;

  console.log('📊 Stats values:', { totalSessions, totalStudents });

  totalSessionsEl.textContent = totalSessions;
  totalStudentsEl.textContent = totalStudents;

  attendanceStats.classList.remove('hidden');

  console.log('✅ Stats updated successfully');
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

function performSearch() {
  const studentSearchInput = document.getElementById('studentSearchInput');
  const searchStats = document.getElementById('searchStats');
  const viewTbody = document.getElementById('view-tbody');

  const searchTerm = studentSearchInput.value.toLowerCase().trim();

  const rows = viewTbody.querySelectorAll('tr');
  let visibleCount = 0;

  rows.forEach(row => {
    const studentID = row.querySelector('td:nth-child(2)')?.textContent.toLowerCase() || '';
    const studentName = row.querySelector('td:nth-child(3)')?.textContent.toLowerCase() || '';

    if (studentID.includes(searchTerm) || studentName.includes(searchTerm)) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });

  if (searchStats) {
    searchStats.innerHTML = searchTerm
      ? `<span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">info</span>Showing ${visibleCount} of ${rows.length} students`
      : '';
  }
}

// ============================================================================
// EDIT FUNCTIONALITY
// ============================================================================

function enableEditMode() {
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const viewTbody = document.getElementById('view-tbody');

  if (!registerData && !currentDateData) {
    showNotification('Please load attendance data first', 'warning');
    return;
  }

  isEditMode = true;
  originalData = viewTbody.innerHTML;

  const statusChips = viewTbody.querySelectorAll('.status-chip');

  console.log(`✏️ Found ${statusChips.length} status chips to convert`);

  statusChips.forEach((chip, index) => {
    const isPresent = chip.textContent.trim() === 'P';
    const studentId = chip.dataset.student;
    const sessionId = chip.dataset.session;

    if (!studentId || !sessionId) {
      console.warn(`⚠️ Chip ${index} missing data attributes:`, { studentId, sessionId });
      return;
    }

    const td = chip.parentElement;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isPresent;
    checkbox.className = 'edit-checkbox';
    checkbox.dataset.student = studentId;
    checkbox.dataset.session = sessionId;
    checkbox.style.cssText = `
      width: 20px;
      height: 20px;
      cursor: pointer;
      accent-color: #6366F1;
      transform: scale(1.2);
    `;

    td.innerHTML = '';
    td.appendChild(checkbox);
  });

  if (editAttendanceBtn) editAttendanceBtn.classList.add('hidden');
  if (deleteAttendanceBtn) deleteAttendanceBtn.classList.add('hidden');
  if (saveAttendanceBtn) saveAttendanceBtn.classList.remove('hidden');
  if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');

  showNotification('Edit mode enabled', 'info');
  console.log('✅ Edit mode enabled with checkboxes');
}

async function saveAttendance() {
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const viewTbody = document.getElementById('view-tbody');

  if (!isEditMode) {
    showNotification('Not in edit mode', 'warning');
    return;
  }

  try {
    const checkboxes = Array.from(viewTbody.querySelectorAll('.edit-checkbox'));

    if (checkboxes.length === 0) {
      showNotification('No attendance data to save', 'warning');
      return;
    }

    console.log('💾 Saving attendance changes...');
    console.log('📊 Total checkboxes:', checkboxes.length);

    const originalHTML = saveAttendanceBtn.innerHTML;
    saveAttendanceBtn.disabled = true;
    saveAttendanceBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">hourglass_empty</span> Saving...';

    if (currentViewMode === 'single' && currentDateData) {
      console.log('📅 Single date mode - preparing bulk update');

      const updates = [];

      currentDateData.sessions.forEach(session => {
        const studentsPresent = [];
        const sessionCheckboxes = checkboxes.filter(cb => cb.dataset.session === session._id);

        sessionCheckboxes.forEach(checkbox => {
          if (checkbox.checked) {
            studentsPresent.push(checkbox.dataset.student);
          }
        });

        updates.push({
          sessionId: session._id,
          studentsPresent,
          totalStudents: currentDateData.students.length
        });

        console.log(`📝 Session ${session.time}: ${studentsPresent.length}/${currentDateData.students.length} present`);
      });

      console.log('🚀 Sending bulk update request...');

      const response = await fetch(`${API_BASE_URL}/attendance/bulk/${currentStream}/sem${currentSemester}/${encodeURIComponent(currentSubject)}/${currentDate}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      const result = await response.json();

      if (result.success) {
        showNotification(`Successfully updated ${result.modified} record(s)`, 'success');

        isEditMode = false;
        if (saveAttendanceBtn) saveAttendanceBtn.classList.add('hidden');
        if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
        if (editAttendanceBtn) editAttendanceBtn.classList.remove('hidden');
        if (deleteAttendanceBtn) deleteAttendanceBtn.classList.remove('hidden');

        await loadSingleDateView();
      } else {
        showNotification('Failed to update: ' + result.error, 'error');
        saveAttendanceBtn.disabled = false;
        saveAttendanceBtn.innerHTML = originalHTML;
      }
    }
    else if (currentViewMode === 'full' && registerData) {
      console.log('📚 Full register mode - preparing session updates');

      const sessionUpdates = new Map();

      checkboxes.forEach(checkbox => {
        const sessionId = checkbox.dataset.session;
        const studentId = checkbox.dataset.student;
        const isPresent = checkbox.checked;

        if (!sessionId || !studentId) {
          console.warn('⚠️ Checkbox missing data:', { sessionId, studentId });
          return;
        }

        if (!sessionUpdates.has(sessionId)) {
          sessionUpdates.set(sessionId, {
            sessionId,
            studentsPresent: [],
            totalStudents: registerData.totalStudents
          });
        }

        if (isPresent) {
          sessionUpdates.get(sessionId).studentsPresent.push(studentId);
        }
      });

      console.log(`🚀 Updating ${sessionUpdates.size} sessions...`);

      const updatePromises = Array.from(sessionUpdates.values()).map(update => {
        console.log(`📝 Updating session ${update.sessionId}: ${update.studentsPresent.length}/${update.totalStudents} present`);

        return fetch(`${API_BASE_URL}/attendance/session/${update.sessionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            studentsPresent: update.studentsPresent,
            totalStudents: update.totalStudents
          })
        });
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r.ok).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        showNotification(`Successfully updated ${successCount} session(s)`, 'success');

        isEditMode = false;
        saveAttendanceBtn.classList.add('hidden');
        cancelEditBtn.classList.add('hidden');
        editAttendanceBtn.classList.remove('hidden');

        await loadRegister();
      } else {
        showNotification(`Updated ${successCount} sessions, ${failCount} failed`, 'warning');
        saveAttendanceBtn.disabled = false;
        saveAttendanceBtn.innerHTML = originalHTML;
      }
    }

  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    showNotification('Error saving attendance: ' + error.message, 'error');

    const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
    saveAttendanceBtn.disabled = false;
    saveAttendanceBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 16px;">save</span> Save';
  }
}

function cancelEdit() {
  const viewTbody = document.getElementById('view-tbody');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  viewTbody.innerHTML = originalData;
  isEditMode = false;

  if (editAttendanceBtn) editAttendanceBtn.classList.remove('hidden');

  if (currentViewMode === 'single' && currentDateData) {
    if (deleteAttendanceBtn) deleteAttendanceBtn.classList.remove('hidden');
  } else {
    if (deleteAttendanceBtn) deleteAttendanceBtn.classList.add('hidden');
  }

  if (saveAttendanceBtn) saveAttendanceBtn.classList.add('hidden');
  if (cancelEditBtn) cancelEditBtn.classList.add('hidden');

  showNotification('Edit cancelled', 'info');
  console.log('❌ Edit cancelled');
}

async function deleteAttendance() {
  const specificDateInput = document.getElementById('specificDateInput');
  const viewTbody = document.getElementById('view-tbody');

  if (!currentDateData) {
    showNotification('Please select a date first', 'warning');
    return;
  }

  const message = `Delete ${currentDateData.sessions.length} record(s) for ${currentDate}? This action cannot be undone.`;

  showConfirm(message, async () => {
    try {
      const deletePromises = currentDateData.sessions.map(session =>
        fetch(`${API_BASE_URL}/attendance/${session._id}`, { method: 'DELETE' })
      );

      const results = await Promise.all(deletePromises);
      const allSuccess = results.every(r => r.ok);

      if (allSuccess) {
        showNotification('Records deleted successfully', 'success');

        currentDateData = null;
        specificDateInput.value = '';
        viewTbody.innerHTML = `
          <tr>
            <td colspan="10" style="text-align: center; padding: 60px;">
              <span class="material-symbols-rounded" style="font-size: 48px; color: #22C55E; display: block; margin-bottom: 16px; font-variation-settings: 'FILL' 1;">check_circle</span>
              <p style="color: #6b7280; font-size: 14px;">Records deleted successfully</p>
            </td>
          </tr>
        `;

        if (registerData) {
          await loadRegister();
        }
      } else {
        showNotification('Failed to delete some records', 'error');
      }

    } catch (error) {
      console.error('❌ Error deleting:', error);
      showNotification('Error deleting attendance: ' + error.message, 'error');
    }
  });
}

// ============================================================================
// EXPORT TO EXCEL
// ============================================================================

function exportToExcel() {
  if (!registerData) {
    showNotification('No data to export', 'warning');
    return;
  }

  try {
    const wb = XLSX.utils.book_new();
    const data = [];

    const header = ['#', 'Student ID', 'Name'];
    registerData.sessions.forEach(session => {
      const date = new Date(session.date).toLocaleDateString('en-GB');
      header.push(`${date} ${session.time}`);
    });
    header.push('Present', 'Absent', 'Percentage');
    data.push(header);

    registerData.students.forEach((student, index) => {
      const row = [index + 1, student.studentID, student.name];
      student.attendance.forEach(att => row.push(att.status));
      row.push(student.presentCount, student.absentCount, student.attendancePercentage + '%');
      data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    const filename = `Attendance_${currentStream}_Sem${currentSemester}_${currentSubject}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    console.log('📊 Exported:', filename);
    showNotification('Excel file downloaded successfully', 'success');
  } catch (error) {
    console.error('❌ Export error:', error);
    showNotification('Failed to export Excel file', 'error');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showLoadingState() {
  const viewTbody = document.getElementById('view-tbody');
  viewTbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 60px;">
        <div style="
          width: 40px;
          height: 40px;
          border: 3px solid #E2E8F0;
          border-top-color: #6366F1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        "></div>
        <p style="color: #6b7280; font-size: 14px;">Loading data...</p>
      </td>
    </tr>
  `;

  if (!document.getElementById('spinner-animation')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'spinner-animation';
    styleSheet.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
  }
}

function showButtons() {
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  exportExcelBtn.classList.remove('hidden');
}
