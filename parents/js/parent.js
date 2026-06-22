const API = window.APP_CONFIG.API_BASE_URL;
let currentStudent = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  
  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) {
    if (id === 'profileScreen') {
      mainHeader.style.display = 'none';
    } else {
      mainHeader.style.display = 'flex';
    }
  }
}

function togglePassword(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    iconEl.textContent = 'visibility_off';
  } else {
    input.type = 'password';
    iconEl.textContent = 'visibility';
  }
}
async function logout() { 
  if (currentStudent) {
    try {
      // Get the FCM token if available on Android
      let fcmToken = null;
      if (window.Capacitor && window.Capacitor.Plugins.PushNotifications) {
          try {
              // Note: We might not have a direct way to retrieve the current token synchronously, 
              // but if we store it locally or just pass null, the backend fallback clears all.
              fcmToken = localStorage.getItem('lastFcmToken') || null;
          } catch(e) {}
      }
      
      let token = localStorage.getItem('parentAuthToken');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${API}/parent/logout`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ fcmToken: fcmToken, reason: 'user_logout' }),
        credentials: 'include'
      });
    } catch (e) { console.error('Logout report failed:', e); }
  }
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  currentStudent = null; 
  localStorage.removeItem('parentStudentID');
  localStorage.removeItem('parentAuthToken');
  const dName = document.getElementById('drawerStudentName');
  const dMeta = document.getElementById('drawerStudentMeta');
  if (dName) dName.textContent = '';
  if (dMeta) dMeta.textContent = '';
  showScreen('loginScreen'); 
}

// Helper: Convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ===== PUSH NOTIFICATIONS =====
async function safeRegisterPush(studentID) {
  try {
    // 1. Android Native Push (Capacitor)
    if (window.Capacitor && window.Capacitor.Plugins.PushNotifications) {
      console.log('Using Capacitor Native Push for Android');
      const { PushNotifications } = window.Capacitor.Plugins;
      
      const permStatus = await PushNotifications.requestPermissions();
      await reportNotificationStatus(studentID, permStatus.receive === 'granted' ? 'granted' : 'denied');
      
      if (permStatus.receive === 'granted') {
        // Explicitly create the channel to ensure badges and high importance popups work on Android 8.0+
        await PushNotifications.createChannel({
          id: 'attendance_alerts',
          name: 'Attendance Alerts',
          description: 'Important notifications about attendance',
          importance: 5, // MAX importance (Heads-up + Badge)
          visibility: 1, // Public
          vibration: true
        });

        await PushNotifications.register();
        
        PushNotifications.addListener('registration', async (token) => {
          console.log('Firebase Push Token:', token.value);
          localStorage.setItem('lastFcmToken', token.value);
          await fetch(`${API}/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentID: studentID, platform: 'android', token: token.value }),
            credentials: 'include'
          });
        });
        
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Foreground Push received:', notification);
          // Android WebViews don't support Web Notifications. Show a custom toast.
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#1E4D2B; color:white; padding:16px; border-radius:12px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.3); max-width:90%; width:350px; transition:0.3s; animation: slideDown 0.5s ease; display:flex; flex-direction:column; gap:4px;';
          toast.innerHTML = `<div style="font-weight:bold;font-size:16px;">${notification.title}</div><div style="font-size:14px;opacity:0.9;">${notification.body}</div>`;
          document.body.appendChild(toast);
          setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => toast.remove(), 300);
          }, 4000);
          
          if (!document.getElementById('toastStyle')) {
            const style = document.createElement('style');
            style.id = 'toastStyle';
            style.innerHTML = `@keyframes slideDown { from { top:-50px; opacity:0; } to { top:20px; opacity:1; } }`;
            document.head.appendChild(style);
          }
        });
      }
      return;
    }

    // 2. Standard Web Push (For iOS PWA / Desktop Web)
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      console.log('Using standard Web Push for iOS PWA / Desktop Web');
      
      const permission = await Notification.requestPermission();
      await reportNotificationStatus(studentID, permission === 'granted' ? 'granted' : 'denied');
      
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        
        // Fetch VAPID key from backend
        const keyRes = await fetch(`${API}/push/vapid-public-key`);
        const keyData = await keyRes.json();
        if (!keyData.success) throw new Error('VAPID key retrieval failed');
        
        const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
        
        // Subscribe using PushManager
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });
        
        console.log('Successfully subscribed to Web Push:', subscription);
        
        // Register Web Push subscription in backend
        await fetch(`${API}/push/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentID, platform: 'ios', subscription }),
          credentials: 'include'
        });
      } else {
        console.log('Web Push permission denied.');
      }
    } else {
      await reportNotificationStatus(studentID, 'not_supported');
      console.log('Push Notifications not available on this device/browser.');
    }
  } catch (err) {
    console.error('Failed to register push:', err);
  }
}

// Report notification permission status to backend
async function reportNotificationStatus(studentID, status) {
  try {
    await authFetch(`${API}/parent/update-notification-status`, {
      method: 'POST',
      body: JSON.stringify({ studentID, status })
    });
    console.log('Notification status reported:', status);
  } catch (e) { console.error('Failed to report notification status:', e); }
}

// Report login activity to backend
async function reportActivity(studentID) {
  try {
    await authFetch(`${API}/parent/update-activity`, {
      method: 'POST',
      body: JSON.stringify({ studentID })
    });
  } catch (e) { console.error('Failed to report activity:', e); }
}

// Heartbeat - ping activity every 2 minutes for real-time tracking
let heartbeatInterval = null;
function startHeartbeat(studentID) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => reportActivity(studentID), 2 * 60 * 1000);
}

// ===== AUTHENTICATION WRAPPER =====
async function authFetch(url, options = {}) {
  let token = localStorage.getItem('parentAuthToken');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  let res = await fetch(url, { ...options, headers, credentials: 'include' });
  
  if (res.status === 401) {
    // Clone response so we can read JSON without breaking it if we return it later
    const clonedRes = res.clone();
    try {
        const data = await clonedRes.json();
        if (data.error === 'SESSION_INVALIDATED') {
            localStorage.clear();
            sessionStorage.clear();
            
            const errDiv = document.getElementById('loginError');
            if (errDiv) {
                errDiv.textContent = 'Your password was wiped by admin. Please create a new password using Sign Up.';
                errDiv.classList.remove('hidden');
            } else {
                alert('Your password was wiped by admin. Please create a new password using Sign Up.');
            }
            
            setTimeout(() => {
                window.location.href = '/index.html'; // Or whatever the root login is
            }, 2000);
            return res; // Stop execution
        }
    } catch(e) {}
    
    try {
      console.log('Access token expired, attempting silent refresh...');
      const refreshRes = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const refreshData = await refreshRes.json();
      if (refreshData.success && refreshData.token) {
        console.log('Token refreshed successfully');
        localStorage.setItem('parentAuthToken', refreshData.token);
        
        // Retry original request with the new token
        headers['Authorization'] = `Bearer ${refreshData.token}`;
        res = await fetch(url, { ...options, headers, credentials: 'include' });
      } else {
        throw new Error('Refresh token invalid or expired');
      }
    } catch (e) {
      console.error('Silent refresh failed, logging out:', e);
      logout();
      throw new Error('Session expired. Please log in again.');
    }
  }
  
  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

// ===== STUDENT LOOKUP / LOGIN =====
let currentPendingStudentID = null;

function toggleAuthMode(mode) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const err = document.getElementById('loginError');
  err.classList.add('hidden');
  
  if (mode === 'signup') {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  } else {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  }
}

async function handleLogin(sid, pwd) {
  const btn = document.getElementById('loginBtn');
  const txt = document.getElementById('loginText');
  const spin = document.getElementById('loginSpinner');
  const err = document.getElementById('loginError');
  
  if(txt) txt.textContent = 'Logging in...'; 
  if(spin) spin.classList.remove('hidden'); 
  if(btn) btn.disabled = true; 
  err.classList.add('hidden');

  try {
    const res = await fetch(`${API}/parent/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid, password: pwd }),
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');
    
    localStorage.setItem('parentAuthToken', data.token);
    setupDashboard(data.student);
  } catch (error) {
    err.textContent = error.message; err.classList.remove('hidden');
  } finally {
    if(txt) txt.textContent = 'Login'; 
    if(spin) spin.classList.add('hidden'); 
    if(btn) btn.disabled = false;
  }
}

async function handleSignup(sid, pwd, confirmPwd) {
  const btn = document.getElementById('signupBtn');
  const txt = document.getElementById('signupText');
  const spin = document.getElementById('signupSpinner');
  const err = document.getElementById('loginError');
  
  err.classList.add('hidden');
  if (pwd !== confirmPwd) {
    err.textContent = "Passwords do not match!"; err.classList.remove('hidden');
    return;
  }

  if(txt) txt.textContent = 'Signing up...'; 
  if(spin) spin.classList.remove('hidden'); 
  if(btn) btn.disabled = true; 

  try {
    // Check status first to see if student exists
    const checkRes = await fetch(`${API}/parent/check-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid })
    });
    const checkData = await checkRes.json();
    if (!checkData.success) throw new Error(checkData.error || 'Student not found');
    
    if (checkData.hasPassword) {
      throw new Error('This UUCMS ID is already registered. Please login.');
    }
    
    // Proceed to set password
    const setRes = await fetch(`${API}/parent/set-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid, password: pwd })
    });
    const setData = await setRes.json();
    if (!setData.success) throw new Error(setData.error);
    
    // Login automatically
    await handleLogin(sid, pwd);
    
  } catch (error) {
    err.textContent = error.message; err.classList.remove('hidden');
  } finally {
    if(txt) txt.textContent = 'Sign Up'; 
    if(spin) spin.classList.add('hidden'); 
    if(btn) btn.disabled = false;
  }
}



function setupDashboard(student) {
  currentStudent = student;
  localStorage.setItem('parentStudentID', student.studentID);
  
  const sn = document.getElementById('studentName');
  const sm = document.getElementById('studentMeta');
  if (sn) sn.textContent = student.name;
  if (sm) sm.textContent = `${student.stream} \u00B7 Semester ${student.semester}`;
  
  // Set header avatar initials
  const headerInitials = document.getElementById('headerAvatarInitials');
  if (headerInitials && student.name) {
    const parts = student.name.trim().split(/\s+/);
    const initials = parts.length >= 2 
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
    headerInitials.textContent = initials;
  }
  
  // Clear badge count natively via plugin
  if (window.Capacitor && window.Capacitor.Plugins.Badge) {
    window.Capacitor.Plugins.Badge.clear().catch(e => console.log('Badge clear error', e));
  }
  // Reset unread count on backend
  authFetch(`${API}/parent/notifications/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registerNumber: student.registerNumber || student.studentID })
  }).catch(e => console.log('Backend badge clear error', e));

  const pName = document.getElementById('profileStudentName');
  const pMeta = document.getElementById('profileStudentMeta');
  const pSubMeta = document.getElementById('profileStudentSubMeta');
  if (pName) pName.textContent = student.name;
  if (pMeta) pMeta.textContent = `${student.stream} • Sem ${student.semester}`;
  if (pSubMeta) pSubMeta.textContent = student.studentID || 'ID Not Set';
  
  const profileLargeInitial = document.getElementById('profileLargeInitial');
  if (profileLargeInitial && student.name) {
    profileLargeInitial.textContent = student.name.charAt(0).toUpperCase();
  }

  const displayEmail = document.getElementById('displayParentEmail');
  const displayPhone = document.getElementById('displayParentPhone');
  const displayMentor = document.getElementById('displayMentorEmail');
  const editEmail = document.getElementById('editParentEmail');
  const editPhone = document.getElementById('editParentPhone');
  
  let phoneStr = student.parentPhone || '';
  let phoneDisplay = phoneStr || 'Not set';
  if (phoneStr.match(/^91\d{10}$/)) {
    phoneDisplay = '+91 ' + phoneStr.substring(2);
  } else if (phoneStr.match(/^\d{10}$/)) {
    phoneDisplay = '+91 ' + phoneStr;
  }
  
  if (displayEmail) displayEmail.textContent = student.parentEmail || 'Not set';
  if (displayPhone) displayPhone.textContent = phoneDisplay;
  if (displayMentor) displayMentor.textContent = student.mentorName || 'Not Assigned';
  if (editEmail) editEmail.value = student.parentEmail || '';
  if (editPhone) editPhone.value = phoneDisplay === 'Not set' ? '+91 ' : phoneDisplay;

  showScreen('dashboardScreen');
  setTodayDate();
  switchTab('daily');
  
  reportActivity(currentStudent.studentID);
  startHeartbeat(currentStudent.studentID);
  safeRegisterPush(currentStudent.studentID);
  checkNotifications();
}

function toggleProfileEdit() {
  const viewMode = document.getElementById('profileViewMode');
  const editMode = document.getElementById('profileEditMode');
  const editBtn = document.getElementById('profileEditBtn');
  
  if (editMode.classList.contains('hidden')) {
    viewMode.classList.add('hidden');
    editMode.classList.remove('hidden');
    if (editBtn) editBtn.classList.remove('hidden');
  } else {
    viewMode.classList.remove('hidden');
    editMode.classList.add('hidden');
    if (editBtn) editBtn.classList.add('hidden');
  }
}

async function saveProfile() {
  const email = document.getElementById('editParentEmail').value.trim();
  const phone = document.getElementById('editParentPhone').value.trim();
  const btn = document.getElementById('saveProfileBtn');
  const text = document.getElementById('saveProfileText');
  const spin = document.getElementById('saveProfileSpinner');
  
  btn.disabled = true;
  text.classList.add('hidden');
  spin.classList.remove('hidden');
  
  try {
    const res = await authFetch(`${API}/parent/update-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentEmail: email, parentPhone: phone })
    });
    const data = await res.json();
    if (data.success) {
      let phoneDisplay = phone || 'Not set';
      if (phone.match(/^91\d{10}$/)) phoneDisplay = '+91 ' + phone.substring(2);
      else if (phone.match(/^\d{10}$/)) phoneDisplay = '+91 ' + phone;
      
      document.getElementById('displayParentEmail').textContent = email || 'Not set';
      document.getElementById('displayParentPhone').textContent = phoneDisplay;
      currentStudent.parentEmail = email;
      currentStudent.parentPhone = phone;
      toggleProfileEdit();
      showSuccessToast('Information updated successfully!');
    } else {
      alert(data.error || 'Failed to update profile');
    }
  } catch (e) {
    alert('An error occurred while saving profile');
  } finally {
    btn.disabled = false;
    text.classList.remove('hidden');
    spin.classList.add('hidden');
  }
}

function showSuccessToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:#212529; color:white; padding:14px 24px; border-radius:30px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.15); transition:0.3s cubic-bezier(0.4, 0, 0.2, 1); animation: slideUpToast 0.4s cubic-bezier(0.4, 0, 0.2, 1); display:flex; align-items:center; gap:10px; font-weight: 500; font-size: 14px; white-space: nowrap;';
  toast.innerHTML = `<span class="material-symbols-rounded" style="color:#43A047; font-size:20px;">check_circle</span> <span>${message}</span>`;
  document.body.appendChild(toast);
  
  if (!document.getElementById('toastAnim')) {
    const style = document.createElement('style');
    style.id = 'toastAnim';
    style.textContent = `@keyframes slideUpToast { from { opacity:0; transform:translate(-50%, 20px); } to { opacity:1; transform:translate(-50%, 0); } }`;
    document.head.appendChild(style);
  }
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function checkNotifications() {
  if (!currentStudent) return;
  try {
    const res = await authFetch(`${API}/parent/recent/${currentStudent.studentID}`);
    const data = await res.json();
    if (data.success && data.recent) {
      processNotifications(data.recent);
    }
  } catch(e) {
    console.error("Failed to check notifications:", e);
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid = document.getElementById('loginIDInput').value.trim();
  const pwd = document.getElementById('loginPasswordInput').value;
  if (!sid || !pwd) return;
  await handleLogin(sid, pwd);
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid = document.getElementById('signupIDInput').value.trim();
  const pwd = document.getElementById('signupPasswordInput').value;
  const conf = document.getElementById('signupConfirmPasswordInput').value;
  if (!sid || !pwd) return;
  await handleSignup(sid, pwd, conf);
});

// Auto-login on boot
document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker for PWA / Web Push
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  }

  const token = localStorage.getItem('parentAuthToken');
  if (token) {
    try {
      const res = await authFetch(`${API}/parent/me`);
      const data = await res.json();
      if (data.success) {
        setupDashboard(data.student);
      } else {
        logout();
      }
    } catch(e) {
      console.log('Auto login failed');
      logout();
    } finally {
      document.body.classList.remove('auto-login-in-progress');
    }
  } else {
    document.body.classList.remove('auto-login-in-progress');
  }
});

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (activeNav) activeNav.classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const activeTab = document.getElementById(tab + 'Tab');
  if (activeTab) activeTab.classList.add('active');
  
  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) {
    if (tab === 'profile') {
      mainHeader.style.display = 'none';
    } else {
      mainHeader.style.display = 'flex';
    }
  }
  
  if (tab === 'daily') loadDailyAttendance();
  else if (tab === 'full') loadFullAttendance();
  else if (tab === 'insights') loadInsights();
}

// ===== DATE =====
function setTodayDate() {
  const today = new Date().toLocaleDateString('en-CA');
  document.getElementById('dailyDate').value = today;
  updateDateLabel();
}
function updateDateLabel() {
  const val = document.getElementById('dailyDate').value;
  document.getElementById('dateLabel').textContent = formatDate(val);
}
function changeDate(delta) {
  const input = document.getElementById('dailyDate');
  const d = new Date(input.value); d.setDate(d.getDate() + delta);
  input.value = d.toLocaleDateString('en-CA');
  updateDateLabel();
  loadDailyAttendance();
}
function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function getPercentClass(p) { return p >= 90 ? 'excellent' : p >= 75 ? 'good' : p >= 60 ? 'avg' : 'low'; }
function showLoading() { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

// ===== CUSTOM CALENDAR =====
let calendarCurrentDate = new Date();
let calendarAbsentDates = [];

async function openCustomCalendar() {
  const modal = document.getElementById('customCalendarModal');
  const box = document.getElementById('customCalendarBox');
  const input = document.getElementById('dailyDate');
  
  if (input.value) {
    calendarCurrentDate = new Date(input.value + 'T00:00:00');
  } else {
    calendarCurrentDate = new Date();
  }
  
  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.style.opacity = '1';
  box.style.transform = 'translateY(0)';
  
  await fetchAndRenderCalendar();
}

function closeCustomCalendar() {
  const modal = document.getElementById('customCalendarModal');
  const box = document.getElementById('customCalendarBox');
  modal.style.opacity = '0';
  box.style.transform = 'translateY(20px)';
  setTimeout(() => { modal.style.display = 'none'; }, 300);
}

async function changeCalendarMonth(delta) {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
  await fetchAndRenderCalendar();
}

async function fetchAndRenderCalendar() {
  if (!currentStudent) return;
  const year = calendarCurrentDate.getFullYear();
  const month = String(calendarCurrentDate.getMonth() + 1).padStart(2, '0');
  const monthStr = `${year}-${month}`;
  
  try {
    const res = await authFetch(`${API}/parent/calendar/${currentStudent.studentID}?month=${monthStr}`);
    const data = await res.json();
    if (data.success) {
      calendarAbsentDates = data.absentDates || [];
    } else {
      calendarAbsentDates = [];
    }
  } catch (e) {
    console.error('Failed to fetch calendar absences', e);
    calendarAbsentDates = [];
  }
  
  renderCalendarGrid();
}

function renderCalendarGrid() {
  const grid = document.getElementById('customCalendarGrid');
  const label = document.getElementById('customCalendarMonthYear');
  const input = document.getElementById('dailyDate');
  const selectedDateStr = input.value; 

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  label.textContent = `${monthNames[month]}, ${year}`;
  
  grid.innerHTML = '';
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  // Previous month padding
  for (let i = 0; i < firstDay; i++) {
    const div = document.createElement('div');
    div.className = 'calendar-day inactive';
    div.textContent = daysInPrevMonth - firstDay + i + 1;
    grid.appendChild(div);
  }
  
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = 'calendar-day';
    div.textContent = String(d).padStart(2, '0');
    
    if (dateStr === selectedDateStr) {
      div.classList.add('active');
    }
    if (calendarAbsentDates.includes(dateStr)) {
      div.classList.add('absent');
    }
    
    div.onclick = () => {
      input.value = dateStr;
      updateDateLabel();
      loadDailyAttendance();
      closeCustomCalendar();
    };
    grid.appendChild(div);
  }
  
  // Next month padding
  const totalCells = firstDay + daysInMonth;
  const nextDays = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= nextDays; i++) {
    const div = document.createElement('div');
    div.className = 'calendar-day inactive';
    div.textContent = String(i).padStart(2, '0');
    grid.appendChild(div);
  }
}

// ===== DAILY =====
async function loadDailyAttendance() {
  if (!currentStudent) return;
  const date = document.getElementById('dailyDate').value;
  showLoading();
  try {
    const res = await authFetch(`${API}/parent/daily/${currentStudent.studentID}?date=${date}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    if (data.attendance.length === 0) {
      document.getElementById('dailySummaryCard').innerHTML = `
        <div style="text-align:center; padding: 20px 10px;">
          <span class="material-symbols-rounded" style="font-size:52px; color:rgba(0,0,0,0.1); margin-bottom:12px; display:block;">event_available</span>
          <h4 style="color:var(--text-dark); font-size:20px; font-weight:800; margin-bottom:6px;">No Classes Today</h4>
          <p style="color:var(--text-grey); font-size:14px; font-weight:500;">No classes are scheduled for this date.</p>
        </div>
      `;
      const list = document.getElementById('dailyList');
      list.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded" style="font-size:64px; color:rgba(0,0,0,0.1); margin-bottom:12px; display:block;">calendar_today</span>
          <h4 style="font-size:16px; font-weight:700; color:var(--text-dark); margin-bottom:6px;">No Records</h4>
          <p>There are no classes or attendance records for this specific date.</p>
        </div>
      `;
    } else {
      const s = data.summary;
      const pctClass = getPercentClass(s.percentage);
      document.getElementById('dailySummaryCard').innerHTML = `
        <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.04); border-radius:24px; padding:24px; display:flex; justify-content:space-around; align-items:center; box-shadow:none;">
          <div style="display:flex; flex-direction:column; align-items:center;">
             <div style="font-size:13px; color:var(--text-grey); font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                <div style="width:24px; height:24px; border-radius:50%; background:rgba(25,135,84,0.1); display:flex; align-items:center; justify-content:center;">
                   <span class="material-symbols-rounded" style="font-size:14px; color:#198754;">check_circle</span>
                </div>
                Present
             </div>
             <div style="font-size:48px; font-weight:300; color:var(--text-dark); line-height:1; letter-spacing:-1.5px;">${s.present}</div>
          </div>
          <div style="width:1px; height:60px; background:rgba(0,0,0,0.06);"></div>
          <div style="display:flex; flex-direction:column; align-items:center;">
             <div style="font-size:13px; color:var(--text-grey); font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                <div style="width:24px; height:24px; border-radius:50%; background:rgba(220,53,69,0.1); display:flex; align-items:center; justify-content:center;">
                   <span class="material-symbols-rounded" style="font-size:14px; color:#DC3545;">cancel</span>
                </div>
                Absent
             </div>
             <div style="font-size:48px; font-weight:300; color:#DC3545; line-height:1; letter-spacing:-1.5px;">${s.absent}</div>
          </div>
        </div>`;
      
      const list = document.getElementById('dailyList');
      list.innerHTML = data.attendance.map((a, i) => {
        const isPassing = a.isPresent;
        const iconBg = isPassing ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)';
        const iconColor = isPassing ? '#198754' : '#DC3545';
        const parts = a.subject.split(/[\s-]+/).filter(p => p.length > 0);
        const initials = parts.length === 1 ? parts[0].substring(0, 2).toUpperCase() : parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
        
        return `<div style="background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.04); border-radius: 24px; padding: 16px; display: flex; align-items: center; gap: 14px; margin-bottom: 12px; box-shadow: none;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; flex-shrink: 0;">${initials}</div>
          <div class="class-info" style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; color: var(--text-dark); margin-bottom: 4px; line-height: 1.3;">${a.subject}</div>
            <div style="font-size: 12px; color: var(--text-grey); font-weight: 500;">${a.time || 'Scheduled'}</div>
          </div>
          <span style="padding: 6px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${iconBg}; color: ${iconColor};">${a.isPresent ? 'Present' : 'Absent'}</span>
        </div>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('dailyList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}

// ===== FULL =====
async function loadFullAttendance() {
  if (!currentStudent) return; showLoading();
  try {
    const res = await authFetch(`${API}/parent/full/${currentStudent.studentID}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const o = data.overall;
    const oCls = getPercentClass(o.percentage);
    document.getElementById('overallSummary').innerHTML = `
        <div style="display:flex; gap:12px;">
          <div style="flex:1; background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.04); border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:none;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:50%; border:1px solid rgba(0,0,0,0.1); display:flex; justify-content:center; align-items:center;">
                 <span class="material-symbols-rounded" style="font-size:14px; color:var(--text-dark);">percent</span>
              </div>
              <span style="font-size:13px; color:var(--text-grey); font-weight:600;">Attendance</span>
            </div>
            <div style="font-size:42px; font-weight:300; color:var(--text-dark); margin-top:20px; line-height:1; letter-spacing:-1.5px;">${o.percentage}%</div>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; gap:12px;">
            <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.04); border-radius:20px; padding:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:none;">
              <span style="font-size:12px; color:var(--text-grey); font-weight:500;">Present</span>
              <span style="font-size:24px; font-weight:400; color:var(--text-dark); letter-spacing:-1px;">${o.present}</span>
            </div>
            <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.04); border-radius:20px; padding:16px; display:flex; justify-content:space-between; align-items:center; box-shadow:none;">
              <span style="font-size:12px; color:var(--text-grey); font-weight:500;">Absent</span>
              <span style="font-size:24px; font-weight:400; color:#DC3545; letter-spacing:-1px;">${o.absent}</span>
            </div>
          </div>
        </div>`;
    const list = document.getElementById('subjectList');
    if (data.subjectWise.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">menu_book</span><p>No records found</p></div>`;
    } else {
      list.innerHTML = data.subjectWise.map((s, i) => {
        const isPassing = s.percentage >= 75;
        const iconBg = isPassing ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)';
        const iconColor = isPassing ? '#198754' : '#DC3545';
        const barColor = isPassing ? '#198754' : '#DC3545';
        const parts = s.subject.split(/[\s-]+/).filter(p => p.length > 0);
        const initials = parts.length === 1 ? parts[0].substring(0, 2).toUpperCase() : parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
        
        return `<div style="background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.04); border-radius: 24px; padding: 20px; display: flex; flex-direction: column; align-items: stretch; margin-bottom: 12px; box-shadow: none;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; flex-shrink: 0;">${initials}</div>
            <div class="class-info" style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; color: var(--text-dark); margin-bottom: 4px; line-height: 1.3;">${s.subject}</div>
              <div style="font-size: 12px; color: var(--text-grey); font-weight: 500;">${s.present} present · ${s.absent} absent</div>
            </div>
            <div style="font-size: 28px; font-weight: 300; color: var(--text-dark); letter-spacing: -1px;">${s.percentage}%</div>
          </div>
          <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.04); border-radius: 10px; overflow: hidden; margin-top: 16px; display: flex;">
            <div style="height: 100%; border-radius: 10px; background: ${barColor}; width: ${s.percentage}%"></div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('subjectList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}

// ===== INSIGHTS =====
async function loadInsights() {
  if (!currentStudent) return; 
  showLoading();
  try {
    const [recentRes, analyticsRes] = await Promise.all([
      authFetch(`${API}/parent/recent/${currentStudent.studentID}`),
      authFetch(`${API}/parent/analytics`)
    ]);
    const recentData = await recentRes.json();
    const data = await analyticsRes.json();
    
    if (!recentData.success) throw new Error(recentData.error);
    if (!data.success) throw new Error(data.error);

    // Process Notifications using recent data
    window.cachedRecentData = recentData.recent || [];
    processNotifications(window.cachedRecentData);

    // 1. Overview Card (Subject-Based)
    const atRiskSubjects = data.subjectAnalytics.filter(sub => sub.percentage < data.targetAttendance);
    
    document.getElementById('insightTotalSubjects').textContent = data.subjectAnalytics.length;
    document.getElementById('insightPassingSubjects').textContent = data.subjectAnalytics.length - atRiskSubjects.length;
    document.getElementById('insightRiskSubjects').textContent = atRiskSubjects.length;
    
    const predText = document.getElementById('insightPredictionText');
    const predContainer = document.getElementById('insightPredictionContainer');
    
    if (atRiskSubjects.length > 0) {
       predText.innerHTML = `You have <strong>${atRiskSubjects.length} subject${atRiskSubjects.length > 1 ? 's' : ''}</strong> with attendance below the required ${data.targetAttendance}% limit. Check the detailed breakdown below.`;
       predText.style.color = '#856404';
       predContainer.style.background = '#FFF3CD';
       predContainer.style.border = '1px solid #FFE69C';
       predContainer.querySelector('span').style.color = '#856404';
       predContainer.querySelector('span').textContent = 'warning';
    } else {
       predText.textContent = `You have met the required ${data.targetAttendance}% attendance limit in all subjects. Keep it up!`;
       predText.style.color = '#0F5132';
       predContainer.style.background = 'rgba(255,255,255,0.4)';
       predContainer.style.border = '1px solid rgba(0,0,0,0.05)';
       predContainer.querySelector('span').style.color = '#0F5132';
       predContainer.querySelector('span').textContent = 'check_circle';
    }

    // 2. Subject Bar Chart
    const subjectChartCard = document.getElementById('subjectChartCard');
    const ctx = document.getElementById('subjectBarChart');
    if (ctx && subjectChartCard && data.subjectAnalytics) {
       if (window.subjectChartInstance) window.subjectChartInstance.destroy();
       const labels = data.subjectAnalytics.map(sub => {
          const parts = sub.subject.split(/[\s-]+/).filter(p => p.length > 0);
          if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
          return parts.map(p => p[0].toUpperCase()).join('');
       });
       const points = data.subjectAnalytics.map(sub => sub.percentage);
       // Use a very light grey for passing (matching the image), red for failing
       const bgColors = points.map(p => p >= data.targetAttendance ? 'rgba(222, 226, 230, 0.8)' : 'rgba(220, 53, 69, 0.4)');
       const dotColors = points.map(p => p >= data.targetAttendance ? '#6C757D' : '#DC3545');

       const topLabelsPlugin = {
          id: 'topLabels',
          afterDatasetsDraw(chart, args, pluginOptions) {
             const { ctx } = chart;
             ctx.font = "bold 12px sans-serif";
             ctx.textAlign = "center";
             ctx.textBaseline = "bottom";
             
             chart.data.datasets.forEach((dataset, i) => {
                if (dataset.type === 'bar') {
                   const meta = chart.getDatasetMeta(i);
                   meta.data.forEach((bar, index) => {
                      const data = dataset.data[index];
                      // Use a dark grey for passing, red for failing text
                      ctx.fillStyle = data >= 75 ? "#495057" : "#DC3545";
                      ctx.fillText(data + '%', bar.x, bar.y - 8);
                   });
                }
             });
          }
       };

       window.subjectChartInstance = new Chart(ctx, {
          data: {
             labels: labels,
             datasets: [
                {
                   type: 'line',
                   label: 'Target (75%)',
                   data: Array(labels.length).fill(75),
                   borderColor: 'rgba(220, 53, 69, 0.5)',
                   borderWidth: 2,
                   borderDash: [5, 5],
                   pointRadius: 0,
                   fill: false,
                   order: 3
                },
                {
                   type: 'line',
                   label: 'Dots',
                   data: points,
                   borderColor: 'transparent',
                   pointBackgroundColor: dotColors,
                   pointBorderColor: dotColors,
                   pointRadius: 3,
                   showLine: false,
                   order: 1
                },
                {
                   type: 'bar',
                   label: 'Attendance %',
                   data: points,
                   backgroundColor: bgColors,
                   borderWidth: 0,
                   borderRadius: 100, // Pill shaped bars
                   borderSkipped: false,
                   barPercentage: 0.6, // Make bars look wider/rounder like the image
                   order: 2
                }
             ]
          },
          options: {
             responsive: true,
             maintainAspectRatio: false,
             plugins: { 
                legend: { display: false },
                tooltip: {
                   callbacks: {
                      title: (ctx) => data.subjectAnalytics[ctx[0].dataIndex].subject // Full name on hover
                   }
                }
             },
             scales: {
                y: { min: 0, max: 100, grid: { display: false }, ticks: { display: false } },
                x: { grid: { display: false }, ticks: { color: 'var(--text-grey)', font: { size: 10, weight: 600 } } }
             }
          },
          plugins: [topLabelsPlugin]
       });
    }

    // 3. Subjects at Risk
    const shortageList = document.getElementById('insightShortageList');
    const shortageTitle = document.getElementById('shortageTitle');
    if (shortageList && shortageTitle && data.subjectAnalytics) {
       const atRisk = data.subjectAnalytics.filter(sub => sub.percentage < data.targetAttendance);
       if (atRisk.length > 0) {
          shortageTitle.style.display = 'block';
          shortageList.innerHTML = atRisk.map(sub => {
             const classesNeeded = Math.ceil((0.75 * sub.totalClasses - sub.attendedClasses) / 0.25);
             return `
             <div style="background: #FFF3CD; border: 1px solid #FFE69C; border-radius: 16px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                   <h5 style="font-size: 15px; font-weight: 700; color: #856404; margin: 0;">${sub.subject}</h5>
                   <div style="font-size: 14px; font-weight: 800; color: #DC3545;">${sub.percentage}%</div>
                </div>
                <div style="font-size: 13px; color: #856404; margin-bottom: 0;">
                   <strong>Shortage:</strong> You need to attend <strong>${classesNeeded}</strong> more classes to reach 75%.
                </div>
             </div>`;
          }).join('');
       } else {
          shortageTitle.style.display = 'none';
          shortageList.innerHTML = '';
       }
    }

    // 4. AI Insights
    const aiList = document.getElementById('insightAIList');
    if (aiList) {
       if (data.insights && data.insights.length > 0) {
          aiList.innerHTML = data.insights.map((insight, idx) => {
             const isWarning = idx === 0 && data.currentAttendance < data.targetAttendance;
             return `
             <div style="display: flex; gap: 12px; background: ${isWarning ? '#FFF3CD' : '#F8FBF9'}; border: 1px solid ${isWarning ? '#FFE69C' : '#E8F5E9'}; border-radius: 16px; padding: 16px;">
                <span class="material-symbols-rounded" style="color: ${isWarning ? '#856404' : '#198754'}; font-size: 20px; flex-shrink: 0;">${isWarning ? 'warning' : 'lightbulb'}</span>
                <p style="font-size: 14px; color: var(--text-dark); margin: 0; line-height: 1.5; font-weight: 500;">${insight}</p>
             </div>`;
          }).join('');
       } else {
          aiList.innerHTML = '';
       }
    }

  } catch (err) {
    console.error("Error loading insights:", err);
  } finally { hideLoading(); }
}



function togglePassword(inputId, iconElement) {
  const input = document.getElementById(inputId);
  if (input && input.type === 'password') {
    input.type = 'text';
    iconElement.textContent = 'visibility_off';
  } else if (input) {
    input.type = 'password';
    iconElement.textContent = 'visibility';
  }
}

function toggleNotifications(e) {
  if (e) e.stopPropagation();
  const drawer = document.getElementById('notifDrawer');
  if (drawer) {
    drawer.classList.toggle('open');
    if (drawer.classList.contains('open')) {
      const dot = document.getElementById('notifDot');
      const profileDot = document.getElementById('profileNotifDot');
      if (dot) dot.style.display = 'none';
      if (profileDot) profileDot.style.display = 'none';
      localStorage.setItem('notificationsSeenAt', Date.now().toString());
    }
  }
}

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notifDrawer');
  // If dropdown is open and the click is outside the dropdown and outside the bell icon
  if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target)) {
    const notifBtn = document.querySelector('.header-actions button[onclick*="toggleNotifications"]');
    if (notifBtn && !notifBtn.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  }
});

window.renderedAlertKeys = [];

function clearAlerts() {
  const dismissed = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
  if (window.renderedAlertKeys) {
    window.renderedAlertKeys.forEach(key => {
      if (!dismissed.includes(key)) dismissed.push(key);
    });
  }
  localStorage.setItem('dismissedAlerts', JSON.stringify(dismissed));
  
  const notifList = document.getElementById('notifList');
  const notifDot = document.getElementById('notifDot');
  const profileDot = document.getElementById('profileNotifDot');
  if (notifList) notifList.innerHTML = `<p style="color: var(--text-grey); font-size: 14px; text-align: center; margin-top: 20px;">You're all caught up!</p>`;
  if (notifDot) notifDot.style.display = 'none';
  if (profileDot) profileDot.style.display = 'none';
  localStorage.setItem('notificationsSeenAt', Date.now().toString());
}

async function processNotifications(recentDays) {
  const notifList = document.getElementById('notifList');
  const notifDot = document.getElementById('notifDot');
  if (!notifList || !notifDot || !currentStudent) return;
  
  let html = '';
  let activeAlerts = 0;
  let unreadAlerts = 0;
  window.renderedAlertKeys = [];
  
  const now = new Date();
  const firstName = currentStudent.name ? currentStudent.name.split(' ')[0] : 'Your child';
  const lastSeenStr = localStorage.getItem('notificationsSeenAt');
  const lastSeen = lastSeenStr ? parseInt(lastSeenStr) : 0;
  const dismissedAlerts = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
  
  for (const r of recentDays) {
    if (r.total > 0 && r.present < r.total) {
      const absenceDate = new Date(r.date);
      // Diff in hours
      const diffHrs = (now - absenceDate) / (1000 * 60 * 60);
      
      if (diffHrs <= 24) {
        try {
          const res = await authFetch(`${API}/parent/daily/${currentStudent.studentID}?date=${r.date}`);
          const data = await res.json();
          if (data.success && data.attendance) {
            const absentClasses = data.attendance.filter(a => !a.isPresent);
            const dateStr = absenceDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
            
            absentClasses.forEach(absentClass => {
              const alertKey = r.date + '_' + absentClass.subject + '_' + absentClass.time;
              if (dismissedAlerts.includes(alertKey)) return;
              
              window.renderedAlertKeys.push(alertKey);
              activeAlerts++;
              // An alert is "unread" if we haven't seen notifications since this absence date
              if (absenceDate.getTime() > lastSeen || lastSeen === 0) {
                 unreadAlerts++;
              }
              html += `
                <div style="background: #FBEFEF; border-left: 4px solid #DE3B40; padding: 16px; border-radius: 12px; margin-bottom: 12px; font-family: 'Outfit', sans-serif;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span class="material-symbols-rounded" style="color: #DE3B40; font-size: 18px;">warning</span>
                    <span style="font-weight: 700; color: #DE3B40; font-size: 14px;">Absence Alert</span>
                  </div>
                  <p style="color: var(--text-dark); font-size: 13px; margin: 0; line-height: 1.5; font-weight: 500;"><b>${firstName}</b> was marked absent for <br><b>${absentClass.subject}</b> on ${dateStr} (${absentClass.time || 'Scheduled'}).</p>
                </div>
              `;
            });
          }
        } catch (e) {
          console.error("Error fetching class details for notification:", e);
        }
      }
    }
  }

  if (activeAlerts > 0) {
    notifList.innerHTML = html;
    if (unreadAlerts > 0) {
      notifDot.textContent = unreadAlerts;
      notifDot.style.display = 'flex';
      const profileDot = document.getElementById('profileNotifDot');
      if (profileDot) {
        profileDot.textContent = unreadAlerts;
        profileDot.style.display = 'flex';
      }
    } else {
      notifDot.style.display = 'none';
      const profileDot = document.getElementById('profileNotifDot');
      if (profileDot) profileDot.style.display = 'none';
    }
  } else {
    notifDot.style.display = 'none';
    const profileDot = document.getElementById('profileNotifDot');
    if (profileDot) profileDot.style.display = 'none';
    notifList.innerHTML = `<p style="color: var(--text-grey); font-size: 14px; text-align: center; margin-top: 20px;">You're all caught up!</p>`;
  }
}

  let ptrStartY = 0;
  let ptrCurrentY = 0;
  let isPulling = false;
  
  const getScrollTop = () => {
    const scrollContainer = document.querySelector('.screen.active .scroll-content');
    return scrollContainer ? scrollContainer.scrollTop : window.scrollY;
  };

  document.addEventListener('touchstart', (e) => {
    if (getScrollTop() <= 0) {
      ptrStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const ptrIndicator = document.getElementById('ptrIndicator');
    if (!ptrIndicator) return;
    
    ptrCurrentY = e.touches[0].clientY;
    const pullDistance = ptrCurrentY - ptrStartY;
    
    if (pullDistance > 0 && getScrollTop() <= 0) {
      const yOffset = Math.min(pullDistance, 100);
      ptrIndicator.style.transform = `translate(-50%, ${yOffset}px)`;
      const icon = ptrIndicator.querySelector('span');
      if (icon) icon.style.transform = `rotate(${yOffset * 3}deg)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!isPulling) return;
    isPulling = false;
    
    const ptrIndicator = document.getElementById('ptrIndicator');
    if (!ptrIndicator) return;
    
    const pullDistance = ptrCurrentY - ptrStartY;
    if (pullDistance > 80 && getScrollTop() <= 0) {
      ptrIndicator.classList.add('refreshing');
      ptrIndicator.style.transform = `translate(-50%, 80px)`;
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      ptrIndicator.style.transform = `translate(-50%, 0)`;
    }
    ptrStartY = 0;
    ptrCurrentY = 0;
  }, { passive: true });
