const API = window.APP_CONFIG.API_BASE_URL;
let currentStudent = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function toggleDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('drawer');
  if (overlay && drawer) {
    overlay.classList.toggle('show');
    drawer.classList.toggle('show');
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
      await fetch(`${API}/parent/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentID: currentStudent.studentID }),
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
        await PushNotifications.register();
        
        PushNotifications.addListener('registration', async (token) => {
          console.log('Firebase Push Token:', token.value);
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
    await fetch(`${API}/parent/update-notification-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID, status }),
      credentials: 'include'
    });
    console.log('Notification status reported:', status);
  } catch (e) { console.error('Failed to report notification status:', e); }
}

// Report login activity to backend
async function reportActivity(studentID) {
  try {
    await fetch(`${API}/parent/update-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID }),
      credentials: 'include'
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



function setupDashboard(studentData) {
  currentStudent = studentData;
  document.getElementById('studentName').textContent = currentStudent.name;
  document.getElementById('studentMeta').textContent = `${currentStudent.stream} \u00B7 Semester ${currentStudent.semester}`;
  
  const dName = document.getElementById('drawerStudentName');
  const dMeta = document.getElementById('drawerStudentMeta');
  if (dName) dName.textContent = currentStudent.name;
  if (dMeta) dMeta.textContent = `${currentStudent.stream} \u00B7 Semester ${currentStudent.semester}`;

  showScreen('dashboardScreen');
  setTodayDate();
  switchTab('daily');
  
  reportActivity(currentStudent.studentID);
  startHeartbeat(currentStudent.studentID);
  safeRegisterPush(currentStudent.studentID);
  checkNotifications();
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

// ===== DAILY =====
async function loadDailyAttendance() {
  if (!currentStudent) return;
  const date = document.getElementById('dailyDate').value;
  showLoading();
  try {
    const res = await authFetch(`${API}/parent/daily/${currentStudent.studentID}?date=${date}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const s = data.summary;
    const pctClass = getPercentClass(s.percentage);
    document.getElementById('dailySummaryCard').innerHTML = `
      <div class="summary-block">
        <div class="stat-row">
          <div><div class="val">${s.percentage}%</div><div class="lbl">Attendance</div></div>
          <div><div class="val" style="color:var(--success)">${s.present}</div><div class="lbl">Present</div></div>
          <div><div class="val" style="color:var(--danger)">${s.absent}</div><div class="lbl">Absent</div></div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${pctClass}" style="width:${s.percentage}%"></div>
        </div>
        <div class="progress-meta">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>`;
    const list = document.getElementById('dailyList');
    if (data.attendance.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">event_busy</span><p>No classes recorded for this date</p></div>`;
    } else {
      const icons = ['menu_book','science','calculate','biotech','history_edu','computer','palette','psychology'];
      list.innerHTML = data.attendance.map((a, i) => {
        const color = a.isPresent ? 'green' : 'orange';
        return `<div class="list-card">
          <div class="class-icon bg-${color}"><img src="https://ui-avatars.com/api/?name=${a.subject}&background=random&color=fff" alt=""></div>
          <div class="class-info">
            <div class="class-name">${a.subject}</div>
            <div class="class-time">${a.time || 'Scheduled'}</div>
          </div>
          <span class="status-badge ${a.isPresent ? 'present' : 'absent'}">${a.isPresent ? 'Present' : 'Absent'}</span>
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
      <div class="summary-block">
        <div class="stat-row">
          <div><div class="val">${o.percentage}%</div><div class="lbl">Attendance</div></div>
          <div><div class="val" style="color:var(--success)">${o.present}</div><div class="lbl">Present</div></div>
          <div><div class="val" style="color:var(--danger)">${o.absent}</div><div class="lbl">Absent</div></div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${oCls}" style="width:${o.percentage}%"></div>
        </div>
        <div class="progress-meta">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>`;
    const list = document.getElementById('subjectList');
    if (data.subjectWise.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">menu_book</span><p>No records found</p></div>`;
    } else {
      const icons = ['menu_book','science','calculate','biotech','history_edu','computer','palette','psychology'];
      list.innerHTML = data.subjectWise.map((s, i) => {
        const cls = getPercentClass(s.percentage);
        return `<div class="list-card" style="flex-direction:column; align-items:stretch;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="class-icon"><img src="https://ui-avatars.com/api/?name=${s.subject}&background=random&color=fff" alt=""></div>
            <div class="class-info">
              <div class="class-name">${s.subject}</div>
              <div class="class-time">${s.present} present · ${s.absent} absent</div>
            </div>
            <div style="font-size:20px;font-weight:700;">${s.percentage}%</div>
          </div>
          <div class="progress-bar" style="margin-top:10px;"><div class="progress-fill ${cls}" style="width:${s.percentage}%"></div></div>
        </div>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('subjectList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}

// ===== INSIGHTS =====
async function loadInsights() {
  if (!currentStudent) return; showLoading();
  try {
    const [recentRes, fullRes] = await Promise.all([
      authFetch(`${API}/parent/recent/${currentStudent.studentID}`),
      authFetch(`${API}/parent/full/${currentStudent.studentID}`)
    ]);
    const recentData = await recentRes.json();
    const fullData = await fullRes.json();
    
    if (!recentData.success) throw new Error(recentData.error);
    if (!fullData.success) throw new Error(fullData.error);

    window.cachedRecentData = recentData.recent || [];
    
    // Process Notifications
    processNotifications(window.cachedRecentData);

    // 1. Data Setup
    const overallPct = fullData.overall.percentage || 0;
    const classAvg = 76; 

    // 2. Clear Message Card
    const msgEl = document.getElementById('insightMessage');
    if (overallPct >= 85) {
      msgEl.innerHTML = `✅ ${currentStudent.name} is attending better than most students in class`;
    } else if (overallPct >= 75) {
      msgEl.innerHTML = `⚠️ ${currentStudent.name}'s attendance is average, keep an eye on it`;
    } else {
      msgEl.innerHTML = `🔴 ${currentStudent.name} is below the required 75% attendance`;
    }

    // 3. Donut Chart
    document.getElementById('donutPct').textContent = `${overallPct}%`;
    const ctxDonut = document.getElementById('donutChart');
    if (ctxDonut) {
      if (window.donutChartInstance) window.donutChartInstance.destroy();
      window.donutChartInstance = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: ['Attended', 'Missed'],
          datasets: [{
            data: [overallPct, 100 - overallPct],
            backgroundColor: [overallPct >= 75 ? 'rgba(40, 167, 69, 0.8)' : 'rgba(220, 53, 69, 0.8)', 'rgba(200, 200, 200, 0.3)'],
            borderWidth: 0,
            cutout: '75%'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
      });
    }

    // 4. Trend Bar Graph
    updateTrendChart();

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
      if (dot) dot.style.display = 'none';
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
  if (notifList) notifList.innerHTML = `<p style="color: var(--text-grey); font-size: 14px; text-align: center; margin-top: 20px;">You're all caught up!</p>`;
  if (notifDot) notifDot.style.display = 'none';
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
                <div style="background: rgba(220, 53, 69, 0.1); border-left: 4px solid var(--danger); padding: 16px; border-radius: 8px; margin-bottom: 12px;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span class="material-symbols-rounded" style="color: var(--danger); font-size: 20px;">warning</span>
                    <span style="font-weight: 700; color: var(--danger); font-size: 14px;">Absence Alert</span>
                  </div>
                  <p style="color: var(--text-dark); font-size: 13px; margin: 0;"><b>${firstName}</b> was marked absent for <b>${absentClass.subject}</b> on ${dateStr} (${absentClass.time || 'Scheduled'}).</p>
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
    } else {
      notifDot.style.display = 'none';
    }
  } else {
    notifDot.style.display = 'none';
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
