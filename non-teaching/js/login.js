// non-teaching-login.js - Non-Teaching Staff Login Handler
// Date: 2025-12-23

const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

console.log('🔧 Non-Teaching Staff Login - API Base URL:', API_BASE_URL);

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
// NON-TEACHING STAFF LOGIN HANDLER
// ------------------------------------
async function handleNonTeachingLogin(email, password) {
  const auth = window.firebaseAuth;
  if (!auth) throw new Error('Firebase not initialized');
  
  console.log('🔐 Non-Teaching Staff - Setting SESSION persistence...');
  
  // Set SESSION persistence (logout on browser close)
  await window.firebaseSetPersistence(auth, window.firebaseBrowserSessionPersistence);

  const userCredential = await window.firebaseSignIn(auth, email, password);
  const user = userCredential.user;

  console.log('✅ Firebase authentication successful:', user.email);

  localStorage.setItem('staffType', 'non-teaching');
  console.log('💾 Staff type saved: non-teaching');
  
  return user;
}

// ------------------------------------
// FORM SUBMIT HANDLER
// ------------------------------------
document.getElementById('authForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitBtn');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  // Validation
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
    await handleNonTeachingLogin(email, password);
    
    console.log('🎉 Login successful! Redirecting to dashboard.html');
    showNotification('Login successful!', 'success');
    
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
    
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
// AUTO-REDIRECT IF AUTHENTICATED
// ------------------------------------
function checkAuthAndRedirect() {
  const auth = window.firebaseAuth;
  if (!auth) return;
  
  auth.onAuthStateChanged(user => {
    const isOnLoginPage = window.location.pathname.includes('non-teaching-index.html');
    
    console.log('🔍 Auth state:', { user: user?.email || 'None', isOnLoginPage });
    
    if (user && isOnLoginPage) {
      console.log('✅ Already authenticated, redirecting to dashboard.html');
      window.location.replace('dashboard.html');
    }
  });
}

window.addEventListener('load', checkAuthAndRedirect);
if (document.readyState === "complete") checkAuthAndRedirect();

// Expose functions globally
window.togglePasswordVisibility = togglePasswordVisibility;

console.log('✅ Non-Teaching Staff Login loaded');
