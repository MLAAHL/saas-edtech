// ============================================================================
// AUTH — Single Firebase auth guard for all admin pages
// ============================================================================

(function () {
  'use strict';

  // Firebase SDK is loaded via ES module in each page's inline script.
  // This file provides shared auth utilities that work after Firebase is initialized.

  function getAuth() {
    return window.firebaseAuth || null;
  }

  function getCurrentUser() {
    var auth = getAuth();
    return auth ? auth.currentUser : null;
  }

  async function getToken() {
    var user = getCurrentUser();
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (e) {
      console.error('[Auth] Token refresh failed:', e);
      return null;
    }
  }

  async function getAuthHeaders(extraHeaders) {
    var headers = { 'Content-Type': 'application/json' };
    var token = await getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    return headers;
  }

  async function logout() {
    var auth = getAuth();
    if (auth) {
      try {
        var signOut = window.firebaseSignOut || (auth.signOut && auth.signOut.bind(auth));
        if (signOut) await signOut(auth);
      } catch (e) {
        console.error('[Auth] Logout error:', e);
      }
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('index.html');
  }

  function getInitials(name, fallback) {
    if (!name) return fallback || 'AD';
    return name.trim().split(' ').filter(Boolean).map(function (n) { return n[0]; }).join('').substring(0, 2).toUpperCase();
  }

  function getDisplayName(user) {
    if (!user) return 'Admin';
    if (user.displayName) return user.displayName;
    var email = user.email || '';
    return email.split('@')[0]
      .replace(/[._]/g, ' ')
      .split(' ')
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join(' ');
  }

  async function fetchTeacherProfile(email) {
    if (!email) return null;
    try {
      var headers = await getAuthHeaders();
      var API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : '';
      var r = await fetch(API_BASE + '/teacher/profile/email/' + encodeURIComponent(email), { headers: headers });
      if (!r.ok) return null;
      var d = await r.json();
      return (d.success && d.teacher) ? d.teacher : null;
    } catch (e) {
      return null;
    }
  }

  function updateHeaderUI(name, email, profileImageUrl) {
    var el = function (id) { return document.getElementById(id); };

    if (el('headerUserFullName')) el('headerUserFullName').textContent = name;
    if (el('headerUserEmail')) el('headerUserEmail').textContent = email;

    var avatar = el('headerAvatar');
    if (avatar) {
      if (profileImageUrl) {
        avatar.innerHTML = '<img src="' + profileImageUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="' + name + '">';
      } else {
        avatar.textContent = getInitials(name);
      }
    }

    if (el('welcomeText')) {
      el('welcomeText').textContent = 'Welcome, ' + name.split(' ')[0];
    }
  }

  // Initialize auth guard — call this from each page's Firebase module script
  function initAuthGuard(onReady) {
    // Show body once authenticated
    var auth = getAuth();
    if (!auth) {
      console.warn('[Auth] Firebase not initialized yet');
      return;
    }

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        window.location.replace('index.html');
        return;
      }

      document.body.classList.remove('auth-loading');

      // Build display info
      var displayName = getDisplayName(user);
      var profile = await fetchTeacherProfile(user.email);
      if (profile && profile.name) displayName = profile.name;

      updateHeaderUI(displayName, user.email, profile ? profile.profileImageUrl : null);

      // Wire logout button
      var logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = '1';
        logoutBtn.addEventListener('click', logout);
      }

      // Wire profile image upload
      if (typeof window.initProfileUpload === 'function') {
        window.initProfileUpload(user.email);
      }

      // Notify page that auth is ready
      if (typeof onReady === 'function') {
        onReady(user);
      }
    });
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────
  window.Auth = {
    getAuth: getAuth,
    getCurrentUser: getCurrentUser,
    getToken: getToken,
    getAuthHeaders: getAuthHeaders,
    logout: logout,
    getInitials: getInitials,
    getDisplayName: getDisplayName,
    fetchTeacherProfile: fetchTeacherProfile,
    updateHeaderUI: updateHeaderUI,
    initAuthGuard: initAuthGuard
  };

})();
