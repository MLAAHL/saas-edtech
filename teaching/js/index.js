// ============================================================================
// ATTENDANCE.JS - SUBJECT-AWARE FILTERING SYSTEM
// Current Date and Time: 2025-10-30 18:59:14
// Current User: Itzzsk
// ============================================================================

// Wait for Firebase to be available
const getFirebaseAuth = () => window.firebaseAuth;
const getOnAuthStateChanged = () => window.firebaseOnAuthStateChanged;

// ✅ API URL from config
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

console.log('🔧 API Base URL:', API_BASE_URL);

// Global variables
let currentClassInfo = null;
let isPreSelectedSubject = false;
let queueItemId = null;
let allStudents = []; // Store all students for filtering
let subjectMetadata = null; // Store subject details
let userData = {
  userName: 'Teacher',
  userEmail: null,
  firebaseUid: null,
  idToken: null
};

// DOM Elements
const dateInput = document.getElementById('date');
const subjectSelect = document.getElementById('subject');
const languageSelect = document.getElementById('languageSubject');
const electiveSelect = document.getElementById('electiveSubject');
const subjectDisplay = document.getElementById('subjectDisplay');
const selectedSubjectName = document.getElementById('selectedSubjectName');
const studentsList = document.getElementById('students-list');
const presentCountSpan = document.getElementById('presentCount');
const absentCountSpan = document.getElementById('absentCount');

// Search Elements
const searchContainer = document.getElementById('searchContainer');
const studentSearchInput = document.getElementById('studentSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchStats = document.getElementById('searchStats');
const submitBtn = document.getElementById('submitAttendance');
const classInfoCard = document.getElementById('classInfoCard');

// ============================================================================
// FIREBASE AUTHENTICATION
// ============================================================================

function loadUserInfo() {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    const onAuthStateChanged = getOnAuthStateChanged();

    if (auth && onAuthStateChanged) {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          userData.userName = user.displayName || user.email.split('@')[0];
          userData.userEmail = user.email;
          userData.firebaseUid = user.uid;
          userData.idToken = await user.getIdToken();

          console.log('✅ User authenticated:', userData.userEmail);
          resolve(user);
        } else {
          console.log('⚠️ No user authenticated');
          window.location.href = 'index.html';
          resolve(null);
        }
      });
    } else {
      console.log('⚠️ Firebase auth not available');
      setTimeout(() => loadUserInfo(), 500);
    }
  });
}

// ============================================================================
// MODERN NOTIFICATION SYSTEM
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
    top: 60%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 10px;
    padding: 10px 14px;
    box-shadow: 0 8px 20px ${style.shadow}, 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 280px;
    min-width: 220px;
    font-family: 'Poppins', sans-serif;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid rgba(99, 102, 241, 0.08);
  `;

  notification.innerHTML = `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: ${style.gradient};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 3px 8px ${style.shadow};
    ">
      <span class="material-symbols-rounded" style="
        font-size: 16px;
        color: white;
        font-variation-settings: 'FILL' 1;
      ">${style.icon}</span>
    </div>
    
    <span style="
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: #1E293B;
      line-height: 1.3;
    ">${message}</span>
  `;

  if (!document.getElementById('notification-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-animations';
    styleSheet.textContent = `
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translate(-50%, -40%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
      
      @keyframes slideDown {
        from {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => notification.remove(), 250);
  }, 2000);
}

// ============================================================================
// SUBJECT METADATA LOADING
// ============================================================================

async function loadSubjectMetadata(stream, semester, subjectName) {
  try {
    console.log(`📚 Loading subject metadata for "${subjectName}"...`);

    const url = `${API_BASE_URL}/subjects/find?stream=${encodeURIComponent(stream)}&semester=${semester}&name=${encodeURIComponent(subjectName)}`;

    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      console.warn('⚠️ Subject metadata not found');
      return null;
    }

    const data = await response.json();

    if (data.success && data.subject) {
      console.log('✅ Subject metadata loaded:', data.subject);
      return data.subject;
    }

    return null;
  } catch (error) {
    console.error('❌ Error loading subject metadata:', error);
    return null;
  }
}

// ============================================================================
// SMART FILTERING LOGIC
// ============================================================================

function filterStudentsBySubject(students, subjectMeta, manualLanguage = null, manualElective = null) {
  if (!subjectMeta) {
    // No subject metadata, apply manual filters only
    let filtered = students;

    if (manualLanguage && manualLanguage !== 'ALL') {
      filtered = filtered.filter(s =>
        (s.languageSubject || '').toUpperCase() === manualLanguage.toUpperCase()
      );
    }

    if (manualElective && manualElective !== 'ALL') {
      filtered = filtered.filter(s =>
        (s.electiveSubject || '').toUpperCase() === manualElective.toUpperCase()
      );
    }

    return filtered;
  }

  console.log('🔍 Filtering with subject metadata:', {
    subjectType: subjectMeta.subjectType,
    isLanguageSubject: subjectMeta.isLanguageSubject,
    languageType: subjectMeta.languageType
  });

  // If it's a language subject
  if (subjectMeta.isLanguageSubject && subjectMeta.languageType) {
    const targetLang = manualLanguage || subjectMeta.languageType;
    const filtered = students.filter(s =>
      (s.languageSubject || '').toUpperCase() === targetLang.toUpperCase()
    );
    console.log(`🌐 Language filter applied: ${targetLang} → ${filtered.length} students`);
    return filtered;
  }

  // If it's an elective subject
  if (subjectMeta.subjectType === 'ELECTIVE') {
    const targetElective = manualElective || subjectMeta.name;
    const filtered = students.filter(s => {
      const studentElec = (s.electiveSubject || '').toUpperCase();
      const subjectName = targetElective.toUpperCase();
      return studentElec === subjectName || studentElec.includes(subjectName);
    });
    console.log(`📚 Elective filter applied: ${targetElective} → ${filtered.length} students`);
    return filtered;
  }

  // For core subjects, apply manual filters
  let filtered = students;

  if (manualLanguage && manualLanguage !== 'ALL') {
    filtered = filtered.filter(s =>
      (s.languageSubject || '').toUpperCase() === manualLanguage.toUpperCase()
    );
  }

  if (manualElective && manualElective !== 'ALL') {
    filtered = filtered.filter(s =>
      (s.electiveSubject || '').toUpperCase() === manualElective.toUpperCase()
    );
  }

  console.log(`📖 Core subject, manual filters applied → ${filtered.length} students`);
  return filtered;
}

function handleLanguageChange() {
  if (!languageSelect) return;

  const selectedLanguage = languageSelect.value;
  console.log('🔍 Language filter changed to:', selectedLanguage);

  const filteredStudents = filterStudentsBySubject(
    allStudents,
    subjectMetadata,
    selectedLanguage,
    electiveSelect ? electiveSelect.value : null
  );

  displayStudents(filteredStudents);

  if (selectedLanguage && selectedLanguage !== 'ALL') {
    showNotification(`Showing ${filteredStudents.length} ${selectedLanguage} students`, 'info');
  }

  saveToLocalStorage();
}

function handleElectiveChange() {
  if (!electiveSelect) return;

  const selectedElective = electiveSelect.value;
  console.log('🔍 Elective filter changed to:', selectedElective);

  const filteredStudents = filterStudentsBySubject(
    allStudents,
    subjectMetadata,
    languageSelect ? languageSelect.value : null,
    selectedElective
  );

  displayStudents(filteredStudents);

  if (selectedElective && selectedElective !== 'ALL') {
    showNotification(`Showing ${filteredStudents.length} ${selectedElective} students`, 'info');
  }

  saveToLocalStorage();
}

// ============================================================================
// POPULATE DROPDOWNS
// ============================================================================

function populateLanguageDropdown(students) {
  if (!languageSelect) return;

  const languages = [...new Set(students
    .map(s => s.languageSubject)
    .filter(lang => lang && lang.trim() !== '')
  )].sort();

  languageSelect.innerHTML = '<option value="ALL">All Languages</option>';

  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang;
    option.textContent = lang;
    languageSelect.appendChild(option);
  });

  console.log('✅ Populated language dropdown with:', languages);
}

function populateElectiveDropdown(students) {
  if (!electiveSelect) return;

  const electives = [...new Set(students
    .map(s => s.electiveSubject)
    .filter(elec => elec && elec.trim() !== '')
  )].sort();

  electiveSelect.innerHTML = '<option value="ALL">All Electives</option>';

  electives.forEach(elec => {
    const option = document.createElement('option');
    option.value = elec;
    option.textContent = elec;
    electiveSelect.appendChild(option);
  });

  console.log('✅ Populated elective dropdown with:', electives);
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

function saveToLocalStorage() {
  const attendanceData = {
    date: dateInput.value,
    subject: getSelectedSubject(),
    language: languageSelect ? languageSelect.value : 'ALL',
    elective: electiveSelect ? electiveSelect.value : 'ALL',
    students: [],
    presentCount: presentCountSpan.textContent,
    absentCount: absentCountSpan.textContent,
    classInfo: currentClassInfo,
    isPreSelected: isPreSelectedSubject,
    queueItemId: queueItemId,
    timestamp: new Date().toISOString()
  };

  const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    attendanceData.students.push({
      studentID: checkbox.dataset.studentId || checkbox.value,
      name: checkbox.dataset.studentName || 'Unknown',
      present: checkbox.checked
    });
  });

  localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
}

function loadFromLocalStorage() {
  const savedData = localStorage.getItem('attendanceData');
  if (savedData) {
    try {
      const attendanceData = JSON.parse(savedData);

      if (attendanceData.date) {
        dateInput.value = attendanceData.date;
      }

      if (attendanceData.language && languageSelect) {
        languageSelect.value = attendanceData.language;
      }

      if (attendanceData.elective && electiveSelect) {
        electiveSelect.value = attendanceData.elective;
      }

      if (attendanceData.classInfo && attendanceData.isPreSelected) {
        currentClassInfo = attendanceData.classInfo;
        isPreSelectedSubject = true;
        queueItemId = attendanceData.queueItemId;
        showPreSelectedSubject(currentClassInfo.subject);
        showClassInfo(currentClassInfo);
        loadStudentsFromDatabase(currentClassInfo);
      }

      setTimeout(() => {
        if (attendanceData.students && attendanceData.students.length > 0) {
          restoreStudentAttendance(attendanceData.students);
        }
      }, 1000);

    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }
}

function restoreStudentAttendance(savedStudents) {
  const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');

  checkboxes.forEach(checkbox => {
    const studentID = checkbox.dataset.studentId || checkbox.value;
    const savedStudent = savedStudents.find(s => s.studentID === studentID);

    if (savedStudent) {
      checkbox.checked = savedStudent.present;
    }
  });

  const total = checkboxes.length;
  const present = Array.from(checkboxes).filter(cb => cb.checked).length;
  updateCounts(present, total - present);
}

function clearLocalStorage() {
  localStorage.removeItem('attendanceData');
}

// ============================================================================
// SUBJECT SELECTION FUNCTIONS
// ============================================================================

function getSelectedSubject() {
  if (isPreSelectedSubject && currentClassInfo) {
    return currentClassInfo.subject;
  }
  return subjectSelect.value;
}

function showPreSelectedSubject(subjectName) {
  selectedSubjectName.textContent = subjectName;
  subjectDisplay.classList.remove('hidden');
  subjectSelect.classList.add('hidden');
  isPreSelectedSubject = true;
}

function showSubjectDropdown() {
  subjectDisplay.classList.add('hidden');
  subjectSelect.classList.remove('hidden');
  isPreSelectedSubject = false;
}

// ============================================================================
// TIME SLOT CALCULATION
// ============================================================================

function calculateCurrentTimeSlot() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let startHour, startMinute;

    if (currentMinute < 30) {
      startHour = currentHour;
      startMinute = 0;
    } else {
      startHour = currentHour;
      startMinute = 30;
    }

    let endHour = startHour;
    let endMinute = startMinute + 60;

    if (endMinute >= 60) {
      endMinute = endMinute - 60;
      endHour = endHour + 1;
    }

    const formatTime = (h, m) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const displayMinute = m.toString().padStart(2, '0');
      return `${displayHour}:${displayMinute} ${period}`;
    };

    return `${formatTime(startHour, startMinute)} - ${formatTime(endHour, endMinute)}`;

  } catch (error) {
    console.warn('⚠️ Error calculating time slot:', error);
    return 'Current Period';
  }
}

// ============================================================================
// CLASS INFO DISPLAY
// ============================================================================

function showClassInfo(classInfo) {
  document.getElementById('classSubjectName').textContent = classInfo.subject;
  document.getElementById('classStreamSem').textContent = `${classInfo.stream} • Semester ${classInfo.semester}`;
  document.getElementById('classDate').textContent = new Date().toLocaleDateString();

  const timeSlot = calculateCurrentTimeSlot();
  const timeSlotElement = document.getElementById('classTimeSlot');
  if (timeSlotElement) {
    timeSlotElement.textContent = timeSlot;
  }

  classInfoCard.classList.remove('hidden');
}

// ============================================================================
// LOAD STUDENTS FROM DATABASE
// ============================================================================

async function loadStudentsFromDatabase(classInfo) {
  try {
    showLoadingState();
    console.log('📥 Loading students for:', classInfo);

    // Load subject metadata first
    subjectMetadata = await loadSubjectMetadata(classInfo.stream, classInfo.semester, classInfo.subject);

    if (subjectMetadata) {
      console.log('📖 Subject Details:', {
        name: subjectMetadata.name,
        type: subjectMetadata.subjectType,
        isLanguage: subjectMetadata.isLanguageSubject,
        languageType: subjectMetadata.languageType
      });
    }

    const url = `${API_BASE_URL}/students/${encodeURIComponent(classInfo.stream)}/sem${classInfo.semester}`;
    console.log('🔗 Full URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json'
      }
    });

    console.log('📦 Response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Parsed data:', data);

    if (data.success && data.students) {
      allStudents = data.students;
      console.log(`📊 Total students loaded: ${allStudents.length}`);

      // Populate dropdowns
      populateLanguageDropdown(allStudents);
      populateElectiveDropdown(allStudents);

      // Apply smart filtering
      const selectedLanguage = languageSelect ? languageSelect.value : null;
      const selectedElective = electiveSelect ? electiveSelect.value : null;

      const filteredStudents = filterStudentsBySubject(
        allStudents,
        subjectMetadata,
        selectedLanguage,
        selectedElective
      );

      displayStudents(filteredStudents);

      // If it's a language subject, auto-select and lock the language
      if (subjectMetadata && subjectMetadata.isLanguageSubject && subjectMetadata.languageType) {
        if (languageSelect) {
          languageSelect.value = subjectMetadata.languageType;
          languageSelect.disabled = true;
          console.log(`🔒 Language locked to: ${subjectMetadata.languageType}`);
        }
      }
    } else {
      console.warn('⚠️ No students in response:', data);
      displayStudents([]);
    }

  } catch (error) {
    console.error('❌ Error loading students:', error);
    showErrorState(error.message || 'Failed to load students');
  }
}

// ============================================================================
// DISPLAY STUDENTS - CLEAN CARD DESIGN (ID & NAME ONLY)
// ============================================================================

function displayStudents(students) {
  if (!students || students.length === 0) {
    studentsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <span class="material-symbols-rounded">group</span>
        </div>
        <div class="empty-title">No students found</div>
        <div class="empty-text">No students match the current filters</div>
      </div>
    `;
    updateCounts(0, 0);
    saveToLocalStorage();
    hideSearchContainer();
    return;
  }

  const sortedStudents = students.sort((a, b) => {
    const aNum = parseInt(a.studentID);
    const bNum = parseInt(b.studentID);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    return a.studentID.localeCompare(b.studentID, undefined, { numeric: true });
  });

  studentsList.innerHTML = sortedStudents.map((student, index) => `
    <div class="student-card">
      <div class="student-number">${index + 1}</div>
      <div class="student-info">
        <div class="student-id">${student.studentID}</div>
        <div class="student-name">${student.name}</div>
      </div>
      <div class="checkbox-wrapper">
        <input 
          type="checkbox" 
          class="checkbox" 
          data-student-id="${student.studentID}" 
          data-student-name="${student.name}"
          data-language="${student.languageSubject || ''}"
          data-elective="${student.electiveSubject || ''}"
          value="${student.studentID}"
          checked 
        />
      </div>
    </div>
  `).join('');

  updateCounts(sortedStudents.length, 0);
  saveToLocalStorage();
  showSearchContainer();

  console.log(`✅ Displayed ${sortedStudents.length} students (filtered)`);
}

// ============================================================================
// LOADING & ERROR STATES
// ============================================================================

function showLoadingState() {
  studentsList.innerHTML = `
    <div class="loading-state">
      <div class="loading-icon"></div>
      <div class="loading-text">Loading students...</div>
    </div>
  `;
  updateCounts(0, 0);
  hideSearchContainer();
}

function showErrorState(message) {
  studentsList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <span class="material-symbols-rounded">error</span>
      </div>
      <div class="empty-title">Error Loading</div>
      <div class="empty-text">${message}</div>
    </div>
  `;
  updateCounts(0, 0);
  hideSearchContainer();
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

function showSearchContainer() {
  if (searchContainer) searchContainer.classList.remove('hidden');
}

function hideSearchContainer() {
  if (searchContainer) searchContainer.classList.add('hidden');
}

function handleStudentSearch() {
  const searchTerm = studentSearchInput.value.toLowerCase().trim();

  if (searchTerm) {
    clearSearchBtn?.classList.remove('hidden');
  } else {
    clearSearchBtn?.classList.add('hidden');
  }

  if (!searchTerm) {
    clearSearch();
    return;
  }

  const cards = studentsList.querySelectorAll('.student-card');
  let visibleCount = 0;
  let totalCount = cards.length;

  cards.forEach(card => {
    const studentId = card.querySelector('.student-id')?.textContent?.toLowerCase() || '';
    const studentName = card.querySelector('.student-name')?.textContent?.toLowerCase() || '';

    const matchesSearch = studentId.includes(searchTerm) || studentName.includes(searchTerm);

    if (matchesSearch) {
      card.style.display = 'flex';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  updateSearchStats(visibleCount, totalCount, searchTerm);
}

function clearSearch() {
  if (studentSearchInput) {
    studentSearchInput.value = '';
  }

  clearSearchBtn?.classList.add('hidden');

  const cards = studentsList.querySelectorAll('.student-card');
  cards.forEach(card => {
    card.style.display = 'flex';
  });

  if (searchStats) {
    searchStats.textContent = '';
  }
}

function updateSearchStats(visibleCount, totalCount, searchTerm) {
  if (!searchStats) return;

  if (visibleCount === 0) {
    searchStats.innerHTML = `<span style="color: #EF4444;">No students found matching "${searchTerm}"</span>`;
  } else if (visibleCount === totalCount) {
    searchStats.textContent = '';
  } else {
    searchStats.innerHTML = `<span style="color: #6366F1;">Showing ${visibleCount} of ${totalCount} students</span>`;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function updateCounts(present, absent) {
  if (presentCountSpan) presentCountSpan.textContent = present;
  if (absentCountSpan) absentCountSpan.textContent = absent;
}

// ============================================================================
// MOVE QUEUE ITEM TO COMPLETED
// ============================================================================

async function moveQueueItemToCompleted() {
  if (!queueItemId || !userData.userEmail) {
    console.log('⚠️ No queue item to complete');
    return;
  }

  try {
    const deleteResponse = await fetch(`${API_BASE_URL}/teacher/queue/${queueItemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherEmail: userData.userEmail })
    });

    if (!deleteResponse.ok) {
      console.warn('⚠️ Failed to remove from queue');
    }

    const completedClass = {
      id: Date.now().toString(),
      stream: currentClassInfo.stream,
      semester: currentClassInfo.semester,
      subject: currentClassInfo.subject,
      completedAt: new Date().toISOString(),
      teacherEmail: userData.userEmail
    };

    const completedResponse = await fetch(`${API_BASE_URL}/teacher/completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        completedClass: completedClass
      })
    });

    if (completedResponse.ok) {
      console.log('✅ Moved to completed classes');
    }

  } catch (error) {
    console.error('❌ Error moving to completed:', error);
  }
}

// ============================================================================
// SUCCESS CONFIRMATION
// ============================================================================

function showSubmittedConfirmation(subject, date, presentStudents, totalStudents) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(8px);
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 20px;
      padding: 32px;
      max-width: 340px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      text-align: center;
      animation: slideUp 0.3s ease;
    ">
      <div style="
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
      ">
        <span class="material-symbols-rounded" style="color: white; font-size: 32px; font-variation-settings: 'FILL' 1;">check</span>
      </div>
      
      <h3 style="color: #1E293B; margin: 0 0 16px 0; font-size: 20px; font-weight: 700;">
        Attendance Submitted!
      </h3>
      
      <div style="background: #F8F9FA; padding: 16px; border-radius: 12px; margin-bottom: 20px; text-align: left;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span class="material-symbols-rounded" style="color: #6366F1; font-size: 20px;">school</span>
          <span style="color: #1E293B; font-weight: 600;">${subject}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span class="material-symbols-rounded" style="color: #6366F1; font-size: 20px;">calendar_today</span>
          <span style="color: #64748B;">${date}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="material-symbols-rounded" style="color: #10B981; font-size: 20px; font-variation-settings: 'FILL' 1;">check_circle</span>
          <span style="color: #10B981; font-weight: 700;">${presentStudents}/${totalStudents} Present</span>
        </div>
      </div>
      
      <button id="okBtn" style="
        width: 100%;
        padding: 14px;
        border: none;
        background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
        color: white;
        border-radius: 50px;
        font-weight: 700;
        cursor: pointer;
        font-size: 15px;
        font-family: 'Poppins', sans-serif;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        transition: all 0.2s;
      ">
        Done
      </button>
    </div>
  `;

  if (!document.getElementById('dialog-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dialog-animations';
    styleSheet.textContent = `
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(overlay);

  const okBtn = overlay.querySelector('#okBtn');

  okBtn.addEventListener('mouseenter', () => {
    okBtn.style.transform = 'scale(1.02)';
  });

  okBtn.addEventListener('mouseleave', () => {
    okBtn.style.transform = 'scale(1)';
  });

  okBtn.onclick = () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
      overlay.remove();
      window.location.href = 'myclass.html';
    }, 300);
  };
}

// ============================================================================
// CONFIRM DIALOG
// ============================================================================

function showConfirm(message, subject, date, totalStudents, presentStudents, absentStudents, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(8px);
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 20px;
      padding: 28px;
      max-width: 340px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    ">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.1);
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span class="material-symbols-rounded" style="color: #6366F1; font-size: 24px;">help</span>
        </div>
        <h3 style="color: #1E293B; margin: 0; font-size: 18px; font-weight: 700;">Submit Attendance?</h3>
      </div>
      
      <div style="margin-bottom: 20px; background: #F8F9FA; padding: 16px; border-radius: 12px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span class="material-symbols-rounded" style="color: #6366F1; font-size: 18px;">school</span>
          <span style="color: #1E293B; font-weight: 600; font-size: 14px;">${subject}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span class="material-symbols-rounded" style="color: #6366F1; font-size: 18px;">calendar_today</span>
          <span style="color: #64748B; font-size: 14px;">${date}</span>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 12px;">
          <div style="flex: 1; text-align: center; background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 8px;">
            <div style="color: #10B981; font-weight: 700; font-size: 16px;">${presentStudents}</div>
            <div style="color: #64748B; font-size: 11px;">Present</div>
          </div>
          <div style="flex: 1; text-align: center; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 8px;">
            <div style="color: #EF4444; font-weight: 700; font-size: 16px;">${absentStudents}</div>
            <div style="color: #64748B; font-size: 11px;">Absent</div>
          </div>
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button id="cancelBtn" style="
          flex: 1;
          padding: 12px;
          border: 1px solid #E2E8F0;
          background: white;
          color: #1E293B;
          border-radius: 50px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 14px;
        ">Cancel</button>
        
        <button id="confirmBtn" style="
          flex: 1;
          padding: 12px;
          border: none;
          background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
          color: white;
          border-radius: 50px;
          font-weight: 600;
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        ">Submit</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector('#cancelBtn');
  const confirmBtn = overlay.querySelector('#confirmBtn');

  cancelBtn.onclick = () => overlay.remove();
  confirmBtn.onclick = () => {
    overlay.remove();
    onConfirm();
  };
}

// ============================================================================
// SUBMIT FUNCTION
// ============================================================================

function setupSubmitButton() {
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const subject = getSelectedSubject();
      const date = dateInput.value;

      if (!subject || !date) {
        showNotification("Please select date and subject", "error");
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      if (date > today) {
        showNotification("Future dates not allowed", "error");
        return;
      }

      const checkboxes = studentsList.querySelectorAll("input[type='checkbox']");
      const checkedBoxes = studentsList.querySelectorAll("input:checked");
      const totalStudents = checkboxes.length;
      const presentStudents = checkedBoxes.length;
      const absentStudents = totalStudents - presentStudents;

      if (totalStudents === 0) {
        showNotification("No students found", "error");
        return;
      }

      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      showConfirm(
        "confirm",
        subject,
        formattedDate,
        totalStudents,
        presentStudents,
        absentStudents,
        async () => {
          try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="material-symbols-rounded">hourglass_empty</span> Submitting...';

            const studentsPresent = Array.from(checkedBoxes).map(cb =>
              cb.dataset.studentId || cb.value
            );

            const timeSlot = calculateCurrentTimeSlot();

            const selectedLanguage = languageSelect ? languageSelect.value : null;
            const selectedElective = electiveSelect ? electiveSelect.value : null;

            const apiUrl = currentClassInfo
              ? `${API_BASE_URL}/attendance/${encodeURIComponent(currentClassInfo.stream)}/sem${currentClassInfo.semester}/${encodeURIComponent(subject)}`
              : `${API_BASE_URL}/attendance`;

            console.log('📤 Submitting attendance');

            const requestBody = {
              date,
              time: timeSlot,
              teacherEmail: userData.userEmail,
              subject,
              studentsPresent,
              totalStudents,
              presentCount: presentStudents,
              absentCount: absentStudents,
              classInfo: currentClassInfo
            };

            if (selectedLanguage && selectedLanguage !== 'ALL') {
              requestBody.languageSubject = selectedLanguage;
            }

            if (selectedElective && selectedElective !== 'ALL') {
              requestBody.electiveSubject = selectedElective;
            }

            const res = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify(requestBody)
            });

            if (!res.ok) {
              const errorText = await res.text();
              throw new Error(`HTTP ${res.status}: ${errorText}`);
            }

            const result = await res.json();

            if (result.success !== false) {
              await moveQueueItemToCompleted();

              showSubmittedConfirmation(subject, formattedDate, presentStudents, totalStudents);

              clearLocalStorage();
              sessionStorage.removeItem('attendanceSession');

              dateInput.value = new Date().toISOString().split("T")[0];

              if (!isPreSelectedSubject) {
                subjectSelect.value = "";
              }

              if (languageSelect) {
                languageSelect.value = "ALL";
                languageSelect.disabled = false;
              }

              if (electiveSelect) {
                electiveSelect.value = "ALL";
              }

              checkboxes.forEach(cb => cb.checked = false);
              updateCounts(0, 0);

            } else {
              showNotification("Submission failed", "error");
            }

          } catch (err) {
            console.error("❌ Submission error:", err);
            showNotification("Error: " + err.message, "error");
          } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Submit Attendance';
          }
        }
      );
    });
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  if (studentsList) {
    studentsList.addEventListener('change', function (event) {
      if (event.target && event.target.matches('input[type="checkbox"]')) {
        const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');
        const total = checkboxes.length;
        const present = Array.from(checkboxes).filter(cb => cb.checked).length;
        updateCounts(present, total - present);
        saveToLocalStorage();
      }
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const selectedDate = dateInput.value;
      const today = new Date().toISOString().split('T')[0];

      if (selectedDate > today) {
        showNotification('Future dates not allowed', 'warning');
        dateInput.value = today;
      }

      saveToLocalStorage();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', handleLanguageChange);
  }

  if (electiveSelect) {
    electiveSelect.addEventListener('change', handleElectiveChange);
  }

  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', handleStudentSearch);
    studentSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', clearSearch);
  }

  setupSubmitButton();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Attendance System Initialized");
  console.log("📅 Current Date and Time: 2025-10-30 18:59:14");
  console.log("👤 Current User: Itzzsk");

  await loadUserInfo();

  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;
  dateInput.max = today;

  const attendanceSession = sessionStorage.getItem("attendanceSession");
  if (attendanceSession) {
    try {
      const sessionData = JSON.parse(attendanceSession);
      console.log("🎯 Loading preselected class:", sessionData);

      currentClassInfo = {
        stream: sessionData.stream,
        semester: sessionData.semester,
        subject: sessionData.subject
      };

      queueItemId = sessionData.queueItemId;

      isPreSelectedSubject = true;
      showPreSelectedSubject(currentClassInfo.subject);
      showClassInfo(currentClassInfo);

      await loadStudentsFromDatabase(currentClassInfo);

    } catch (error) {
      console.error("❌ Session parsing failed:", error);
      showSubjectDropdown();
    }
  } else {
    const saved = localStorage.getItem("attendanceData");
    if (saved) loadFromLocalStorage();
    else showSubjectDropdown();
  }

  setupEventListeners();
});
