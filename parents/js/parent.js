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
async function logout() { 
  if (currentStudent) {
    try {
      await fetch(`${API}/parent/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentID: currentStudent.studentID })
      });
    } catch (e) { console.error('Logout report failed:', e); }
  }
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  currentStudent = null; 
  localStorage.removeItem('parentStudentID');
  const dName = document.getElementById('drawerStudentName');
  const dMeta = document.getElementById('drawerStudentMeta');
  if (dName) dName.textContent = '';
  if (dMeta) dMeta.textContent = '';
  showScreen('loginScreen'); 
}

// ===== PUSH NOTIFICATIONS =====
async function safeRegisterPush(studentID) {
  try {
    // 1. Android Native Push (Capacitor)
    if (window.Capacitor && window.Capacitor.Plugins.PushNotifications) {
      console.log('Using Capacitor Native Push for Android');
      const { PushNotifications } = window.Capacitor.Plugins;
      
      const permStatus = await PushNotifications.requestPermissions();
      
      // Report notification status to backend
      await reportNotificationStatus(studentID, permStatus.receive === 'granted' ? 'granted' : 'denied');
      
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();
        
        PushNotifications.addListener('registration', async (token) => {
          console.log('Firebase Push Token:', token.value);
          await fetch(`${API}/parent/register-fcm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentID: studentID, fcmToken: token.value })
          });
        });
        
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Foreground Push received:', notification);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(notification.title, { body: notification.body });
            } catch(e) {}
          }
        });
      }
      return;
    }

    // 2. Web Push (For iOS PWA / Desktop Web)
    if (window.firebase && window.APP_CONFIG.FIREBASE_CONFIG && window.APP_CONFIG.FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY") {
      console.log('Using Web Firebase Push (PWA)');
      if (!firebase.apps.length) {
        firebase.initializeApp(window.APP_CONFIG.FIREBASE_CONFIG);
      }
      
      const messaging = firebase.messaging();
      const permission = await Notification.requestPermission();
      
      // Report notification status to backend
      await reportNotificationStatus(studentID, permission === 'granted' ? 'granted' : 'denied');
      
      if (permission === 'granted') {
        const token = await messaging.getToken({ vapidKey: window.APP_CONFIG.FIREBASE_CONFIG.vapidKey });
        if (token) {
          console.log('Web FCM Token:', token);
          await fetch(`${API}/parent/register-fcm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentID: studentID, fcmToken: token })
          });
        }
        
        messaging.onMessage((payload) => {
          console.log('Foreground Message: ', payload);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(function(reg) {
              if (reg && reg.showNotification) {
                reg.showNotification(payload.notification.title, {
                  body: payload.notification.body,
                  icon: '/icon-192.png',
                  data: payload.data
                });
              } else {
                new Notification(payload.notification.title, {
                  body: payload.notification.body
                });
              }
            }).catch(e => console.error("SW notification error", e));
          }
        });
      } else {
        console.log('Web Push permission denied.');
      }
    } else {
      // No push support at all
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
      body: JSON.stringify({ studentID, status })
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
  const token = localStorage.getItem('parentAuthToken');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

// ===== STUDENT LOOKUP =====
let currentPendingStudentID = null;

async function checkStatus(sid) {
  const btn = document.getElementById('lookupBtn');
  const txt = document.getElementById('lookupText');
  const spin = document.getElementById('lookupSpinner');
  const err = document.getElementById('loginError');
  
  txt.textContent = 'Searching...'; spin.classList.remove('hidden'); btn.disabled = true; err.classList.add('hidden');

  try {
    const res = await fetch(`${API}/parent/check-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Student not found');
    
    currentPendingStudentID = sid;
    document.getElementById('lookupForm').classList.add('hidden');
    
    if (data.hasPassword) {
      document.getElementById('loginForm').classList.remove('hidden');
    } else {
      document.getElementById('setPasswordForm').classList.remove('hidden');
    }
  } catch (error) {
    err.textContent = error.message; err.classList.remove('hidden');
  } finally {
    txt.textContent = 'Continue'; spin.classList.add('hidden'); btn.disabled = false;
  }
}

async function setPassword(sid, password, confirmPassword) {
  const err = document.getElementById('loginError');
  err.classList.add('hidden');
  if (password !== confirmPassword) {
    err.textContent = "Passwords do not match!"; err.classList.remove('hidden');
    return;
  }
  
  const btn = document.getElementById('setPwdBtn');
  const txt = document.getElementById('setPwdText');
  const spin = document.getElementById('setPwdSpinner');
  txt.textContent = 'Saving...'; spin.classList.remove('hidden'); btn.disabled = true;
  
  try {
    const res = await fetch(`${API}/parent/set-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    await performLogin(sid, password);
  } catch (error) {
    err.textContent = error.message; err.classList.remove('hidden');
  } finally {
    txt.textContent = 'Create Password'; spin.classList.add('hidden'); btn.disabled = false;
  }
}

async function performLogin(sid, password) {
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
      body: JSON.stringify({ studentID: sid, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
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

document.getElementById('lookupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid = document.getElementById('studentIDInput').value.trim();
  if (!sid) return;
  await checkStatus(sid);
});

document.getElementById('setPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('newPasswordInput').value;
  const conf = document.getElementById('confirmPasswordInput').value;
  if (!pwd || !currentPendingStudentID) return;
  await setPassword(currentPendingStudentID, pwd, conf);
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('loginPasswordInput').value;
  if (!pwd || !currentPendingStudentID) return;
  await performLogin(currentPendingStudentID, pwd);
});

// Auto-login on boot
document.addEventListener('DOMContentLoaded', async () => {
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

async function processNotifications(recentDays) {
  const notifList = document.getElementById('notifList');
  const notifDot = document.getElementById('notifDot');
  if (!notifList || !notifDot || !currentStudent) return;
  
  let html = '';
  let activeAlerts = 0;
  let unreadAlerts = 0;
  
  const now = new Date();
  const firstName = currentStudent.name ? currentStudent.name.split(' ')[0] : 'Your child';
  const lastSeenStr = localStorage.getItem('notificationsSeenAt');
  const lastSeen = lastSeenStr ? parseInt(lastSeenStr) : 0;
  
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
