// teaching-login.js - Teaching Staff Login Handler
// Date: 2025-12-23

const isFirstTime = localStorage.getItem('isFirstTime') === 'true';
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

console.log('🔧 Teaching Staff Login - API Base URL:', API_BASE_URL);

// ------------------------------------
// NOTIFICATION SYSTEM
// ------------------------------------
function showNotification(message, type = 'info') {
  const config = {
    success: { gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', icon: 'check_circle', shadow: 'rgba(16,185,129,0.25)' },
    error: { gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', icon: 'error', shadow: 'rgba(239,68,68,0.25)' },
    warning: { gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', icon: 'warning', shadow: 'rgba(245,158,11,0.25)' },
    info: { gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', icon: 'info', shadow: 'rgba(99,102,241,0.25)' },
  };
  const style = config[type] || config.info;

  const existing = document.querySelector('.custom-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'custom-notification';
  notification.style.cssText = `
    position: fixed; top: 60%; left: 50%; transform: translate(-50%, -50%);
    background: white; border-radius: 10px; padding: 10px 14px;
    box-shadow: 0 8px 20px ${style.shadow}, 0 2px 8px rgba(0,0,0,0.08);
    z-index: 99999; display: flex; align-items: center; gap: 10px;
    max-width: 280px; min-width: 220px; font-family: 'Poppins', sans-serif;
    animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
  `;
  notification.innerHTML = `
    <div style="width: 28px; height: 28px; border-radius: 7px; background: ${style.gradient};
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <span class="material-symbols-rounded" style="font-size: 16px; color: white; font-variation-settings: 'FILL' 1;">
        ${style.icon}
      </span>
    </div>
    <span style="flex: 1; font-size: 13px; font-weight: 600; color: #1E293B;">${message}</span>`;

  if (!document.getElementById('notification-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-animations';
    styleSheet.textContent = `
      @keyframes slideUp { from {opacity: 0; transform: translate(-50%, -40%);} to {opacity: 1; transform: translate(-50%, -50%);} }
      @keyframes slideDown { from {opacity: 1; transform: translate(-50%, -50%);} to {opacity: 0; transform: translate(-50%, -60%);} }
    `;
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.25s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(() => notification.remove(), 250);
  }, 2000);
}

// ------------------------------------
// PASSWORD VISIBILITY TOGGLE
// ------------------------------------
function togglePasswordVisibility() {
  const pwd = document.getElementById('password');
  const icon = document.getElementById('passwordIcon');
  if (pwd.type === 'password') {
    pwd.type = 'text';
    icon.textContent = 'visibility_off';
  } else {
    pwd.type = 'password';
    icon.textContent = 'visibility';
  }
}

// ------------------------------------
// TEACHING STAFF LOGIN HANDLER
// ------------------------------------
async function handleTeachingLogin(email, password, name = null) {
  const auth = window.firebaseAuth;
  if (!auth) throw new Error('Firebase not initialized');

  console.log('🔐 Teaching Staff - Setting LOCAL persistence...');

  // Set LOCAL persistence (stays logged in after browser close)
  await window.firebaseSetPersistence(auth, window.firebaseBrowserLocalPersistence);

  const userCredential = await window.firebaseSignIn(auth, email, password);
  const user = userCredential.user;

  console.log('✅ Firebase authentication successful:', user.email);

  // Ensure teacher profile exists in MongoDB
  console.log('👤 Syncing teaching staff profile...');
  const idToken = await user.getIdToken();

  const profileRes = await fetch(`${API_BASE_URL}/teacher/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      name: name || user.displayName || user.email.split('@')[0],
      email: user.email,
      firebaseUid: user.uid
    }),
  });

  const profileData = await profileRes.json();
  if (profileData.success) {
    console.log('✅ Profile synced successfully:', profileData.teacher.name);
    localStorage.removeItem('isFirstTime');
  } else {
    console.warn('⚠️ Profile sync warning:', profileData.error);
  }

  localStorage.setItem('staffType', 'teaching');
  console.log('💾 Staff type saved: teaching');

  return user;
}

// ------------------------------------
// FORM SUBMIT HANDLER
// ------------------------------------
document.getElementById('authForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitBtn');
  const nameInput = document.getElementById('name');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const name = nameInput ? nameInput.value.trim() : null;

  // Validation
  if (isFirstTime && !name) {
    showNotification('Please enter your name', 'error');
    return;
  }
  if (!email) {
    showNotification('Please enter your email', 'error');
    return;
  }
  if (!password) {
    showNotification('Please enter your password', 'error');
    return;
  }

  submitBtn.disabled = true;
  const originalHTML = submitBtn.innerHTML;
  submitBtn.innerHTML = '<div class="spinner"></div><span>Signing in...</span>';

  try {
    await handleTeachingLogin(email, password, name);

    console.log('🎉 Login successful! Redirecting to myclass.html');
    showNotification(isFirstTime ? 'Profile created successfully!' : 'Welcome back!', 'success');

    // Faster redirect
    setTimeout(() => {
      window.location.replace('myclass.html');
    }, 400);

  } catch (err) {
    console.error('❌ Login error:', err);

    const errorMap = {
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/invalid-email': 'Invalid email address',
      'auth/too-many-requests': 'Too many attempts. Please try later',
      'auth/invalid-credential': 'Invalid email or password',
    };
    showNotification(errorMap[err.code] || err.message || 'Login failed', 'error');

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
  }
});

// ------------------------------------
// AUTO-REDIRECT IF AUTHENTICATED (Fallback)
// The main auth check is in the HTML module script.
// This is just a safety net for edge cases.
// ------------------------------------
function checkAuthAndRedirect() {
  // If Firebase module hasn't loaded yet, wait a bit then show form anyway
  if (!window.firebaseAuth) {
    setTimeout(() => {
      if (!window.firebaseAuth) {
        console.log('⚠️ Firebase taking too long, showing login form');
        showLoginForm();
      }
    }, 2000);
  }
}

function showLoginForm() {
  const splash = document.getElementById('splash-screen');
  const mainContent = document.getElementById('mainContent');

  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  }
  if (mainContent) {
    mainContent.classList.add('visible');
  }
}

// Run on page load as fallback
window.addEventListener('load', checkAuthAndRedirect);

// Expose functions globally
window.togglePasswordVisibility = togglePasswordVisibility;

console.log('✅ Teaching Staff Login loaded');
