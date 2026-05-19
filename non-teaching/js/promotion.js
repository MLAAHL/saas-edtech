// ============================================================================
// PROMOTION.JS - Complete with API Base URL Configuration
// ============================================================================

// ✅ API Configuration
const API_CONFIG = {
  BASE_URL: window.APP_CONFIG.API_BASE_URL,

  ENDPOINTS: {
    STREAMS: '/streams',
    PREVIEW: '/simple-promotion-preview',
    PROMOTE: '/simple-promotion',
    UNDO_CHECK: '/can-undo-promotion',
    UNDO_ACTION: '/undo-promotion'
  }
};

// Helper function to build full URL
function getApiUrl(endpoint, param = '') {
  const path = param ? `${endpoint}/${param}` : endpoint;
  return `${API_CONFIG.BASE_URL}${path}`;
}

// Helper to get authentication headers
async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (window.firebaseAuth && window.firebaseAuth.currentUser) {
    try {
      const token = await window.firebaseAuth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
  } else {
    console.warn('Firebase Auth or User not available for headers');
  }

  return headers;
}

let selectedStream = '';

document.addEventListener('DOMContentLoaded', function () {
  console.log('🚀 Promotion System Initialized');
  console.log('📍 Backend URL:', API_CONFIG.BASE_URL);

  document.getElementById('promotionStream').addEventListener('change', function () {
    const loadBtn = document.getElementById('loadBtn');
    if (loadBtn) loadBtn.disabled = !this.value;
    const statsRow = document.getElementById('statsRow');
    if (statsRow) statsRow.classList.add('hidden');
    const preview = document.getElementById('promotionPreview');
    if (preview) preview.classList.add('hidden');
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');
  });

  const checkAuthAndInit = () => {
    const auth = window.firebaseAuth;
    const onAuthStateChanged = window.firebaseOnAuthStateChanged;
    
    if (auth && onAuthStateChanged) {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          console.log('✅ Auth ready - loading streams for user:', user.email);
          loadStreamsFromDatabase();
        }
      });
    } else {
      setTimeout(checkAuthAndInit, 50);
    }
  };

  checkAuthAndInit();
});

// ============================================================================
// LOAD STREAMS FROM DATABASE
// ============================================================================
async function loadStreamsFromDatabase() {
  const promotionStreamSelect = document.getElementById('promotionStream');

  try {
    promotionStreamSelect.innerHTML = '<option value="">Loading streams...</option>';

    const url = getApiUrl(API_CONFIG.ENDPOINTS.STREAMS);
    console.log('📡 Fetching streams from:', url);

    const headers = await getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Streams API response:', data);

    promotionStreamSelect.innerHTML = '<option value="">-- Select Stream --</option>';

    if (data.success && Array.isArray(data.streams)) {
      data.streams.forEach(stream => {
        const option = document.createElement('option');
        const streamName = stream.name || stream.streamCode || stream;

        option.value = streamName;
        option.textContent = streamName;

        promotionStreamSelect.appendChild(option);
      });

      console.log(`✅ Loaded ${data.streams.length} streams successfully`);
    } else {
      throw new Error('Invalid streams data format');
    }

  } catch (error) {
    console.error('❌ Error loading streams:', error);
    promotionStreamSelect.innerHTML = '<option value="">-- Error Loading Streams --</option>';
    alert('⚠️ Could not load streams from database. Please refresh the page.');
  }
}

// ============================================================================
// LOAD PROMOTION PREVIEW
// ============================================================================
async function loadPromotionPreview() {
  const streamElement = document.getElementById('promotionStream');
  const promoteBtn = document.getElementById('promoteBtn');
  const previewDiv = document.getElementById('promotionPreview');
  const statsRow = document.getElementById('statsRow');
  const undoSection = document.getElementById('undoSection');

  selectedStream = streamElement.value;

  if (!selectedStream) {
    promoteBtn.disabled = true;
    previewDiv.classList.add('hidden');
    statsRow.style.display = 'none';
    if (undoSection) undoSection.classList.add('hidden');
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.PREVIEW, selectedStream);
    console.log('📡 Fetching preview from:', url);

    const headers = await getAuthHeaders();
    const response = await fetch(url, { headers });
    const data = await response.json();

    if (response.ok) {
      promoteBtn.disabled = false;
      previewDiv.classList.remove('hidden');
      statsRow.style.display = 'flex';
      const emptyState = document.getElementById('emptyState');
      if (emptyState) emptyState.classList.add('hidden');

      // Update top stats
      document.getElementById('totalStudents').textContent = data.totalStudents || 0;
      document.getElementById('willGraduate').textContent = data.semesterBreakdown?.semester6 || 0;
      document.getElementById('willPromote').textContent = (data.totalStudents || 0) - (data.semesterBreakdown?.semester6 || 0);
      document.getElementById('sem1Empty').textContent = data.semesterBreakdown?.semester1 || 0;

      // Update semester grid (6 boxes)
      const semesterGrid = document.getElementById('semesterGrid');
      semesterGrid.innerHTML = '';

      for (let sem = 1; sem <= 6; sem++) {
        const count = data.semesterBreakdown?.[`semester${sem}`] || 0;
        semesterGrid.innerHTML += `
          <div class="semester-box">
            <div class="semester-number">${count}</div>
            <div class="semester-name">Semester ${sem}</div>
          </div>
        `;
      }

      // Update promotion flow with 2-column layout
      const promotionFlow = document.getElementById('promotionFlow');
      const flowItems = data.promotionPreview || [];

      promotionFlow.innerHTML = flowItems.map(flow => {
        // Parse: "Sem 1 → Sem 2 (0 students)"
        const match = flow.match(/Sem (\d) → (Sem \d|Graduate) \((\d+) students\)/);
        if (match) {
          const [, from, to, count] = match;
          return `
            <div class="flow-card">
              <span><strong>Sem ${from}</strong> → <strong>${to}</strong></span>
              <span class="flow-count">${count} students</span>
            </div>
          `;
        }
        return `<div class="flow-card">${flow}</div>`;
      }).join('');

      // Check if undo is available
      if (undoSection) {
        try {
          const undoUrl = getApiUrl(API_CONFIG.ENDPOINTS.UNDO_CHECK, selectedStream);
          const headers = await getAuthHeaders();
          const undoResponse = await fetch(undoUrl, { headers });
          const undoData = await undoResponse.json();

          if (undoData.success && undoData.canUndo) {
            const undoBtn = document.getElementById('undoBtn');
            const undoInfo = document.getElementById('undoInfo');

            if (undoBtn) undoBtn.disabled = false;
            if (undoInfo) {
              undoInfo.textContent = `Backup available from ${new Date(undoData.backupTimestamp).toLocaleString()} (${undoData.studentsInBackup} students · ${undoData.hoursOld} hours old)`;
            }
            undoSection.classList.remove('hidden');
          } else {
            undoSection.classList.add('hidden');
          }
        } catch (undoError) {
          console.log('Undo check failed:', undoError);
          if (undoSection) undoSection.classList.add('hidden');
        }
      }

      console.log('✅ Preview loaded successfully');

    } else {
      alert('❌ Error loading preview: ' + data.message);
    }
  } catch (error) {
    console.error('❌ Error loading preview:', error);
    alert('❌ Error loading preview. Please check your connection.');
  }
}

// ============================================================================
// PASSWORD VERIFICATION MODAL HELPER
// ============================================================================
function requestPasswordVerification(description) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('passwordModalOverlay');
    const desc = document.getElementById('passwordModalDescription');
    const input = document.getElementById('confirmPasswordInput');
    const errorMsg = document.getElementById('passwordErrorMsg');
    const errorText = document.getElementById('passwordErrorText');
    const cancelBtn = document.getElementById('cancelPasswordBtn');
    const confirmBtn = document.getElementById('confirmPasswordBtn');

    if (!overlay || !input || !confirmBtn || !cancelBtn) {
      // Fallback
      resolve(true);
      return;
    }

    desc.textContent = description || 'Please enter your password to confirm this action.';
    input.value = '';
    errorMsg.classList.add('hidden');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = 'Verify & Proceed';

    overlay.classList.add('active');
    setTimeout(() => input.focus(), 150);

    const cleanup = () => {
      overlay.classList.remove('active');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
    };

    const handleVerify = async () => {
      const password = input.value;
      if (!password) {
        errorText.textContent = 'Password is required.';
        errorMsg.classList.remove('hidden');
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = 'Verifying...';
      errorMsg.classList.add('hidden');

      try {
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
          throw new Error('Authentication state not loaded.');
        }

        const user = window.firebaseAuth.currentUser;
        const credential = window.EmailAuthProvider.credential(user.email, password);
        await window.reauthenticateWithCredential(user, credential);
        
        // Re-authentication successful!
        cleanup();
        resolve(true);
      } catch (err) {
        console.error('Re-auth verification failed:', err);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Verify & Proceed';
        
        let friendlyMessage = 'Incorrect password. Please try again.';
        if (err.code === 'auth/too-many-requests') {
          friendlyMessage = 'Too many attempts. Account temporarily locked. Please try again later.';
        } else if (err.code === 'auth/network-request-failed') {
          friendlyMessage = 'Network error. Please check your connection.';
        }
        
        errorText.textContent = friendlyMessage;
        errorMsg.classList.remove('hidden');
        input.focus();
        input.select();
      }
    };

    confirmBtn.onclick = handleVerify;
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        handleVerify();
      }
    };
  });
}

// ============================================================================
// EXECUTE PROMOTION
// ============================================================================
async function executeSimplePromotion() {
  if (!selectedStream) {
    alert('❌ Please select a stream first');
    return;
  }

  // Ask for password instead of simple confirm dialog
  const isVerified = await requestPasswordVerification(`You are about to promote all students in ${selectedStream}. A backup will be created and you can undo within 24 hours.`);
  if (!isVerified) return;

  const promoteBtn = document.getElementById('promoteBtn');
  const originalText = promoteBtn.innerHTML;
  promoteBtn.disabled = true;
  promoteBtn.innerHTML = '<i class="material-icons-round" style="font-size: 20px;">hourglass_empty</i> Promoting...';

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.PROMOTE, selectedStream);
    console.log('📡 Executing promotion:', url);

    const authHeaders = await getAuthHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ Promotion Complete for ${result.stream}!\n\n📊 Results:\n• Promoted: ${result.totalPromoted} students\n• Graduated: ${result.totalGraduated} students\n\n💾 Backup created - You can undo within 24 hours.\n\n${result.note || ''}`);
      loadPromotionPreview(); // Refresh to show undo option
    } else {
      alert('❌ Promotion failed: ' + result.message);
    }
  } catch (error) {
    console.error('❌ Error in promotion:', error);
    alert('❌ Network error. Please check your connection.');
  } finally {
    promoteBtn.innerHTML = originalText;
    promoteBtn.disabled = false;
  }
}

// ============================================================================
// UNDO LAST PROMOTION
// ============================================================================
async function undoLastPromotion() {
  if (!selectedStream) {
    alert('❌ Please select a stream first');
    return;
  }

  // Ask for password instead of simple confirm dialog
  const isVerified = await requestPasswordVerification(`You are about to UNDO the last promotion for ${selectedStream}. This will restore all students to their previous semesters.`);
  if (!isVerified) return;

  const undoBtn = document.getElementById('undoBtn');
  const originalText = undoBtn.innerHTML;
  undoBtn.disabled = true;
  undoBtn.innerHTML = '<i class="material-icons-round" style="font-size: 16px;">hourglass_empty</i> Restoring...';

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.UNDO_ACTION, selectedStream);
    console.log('📡 Undoing promotion:', url);

    const authHeaders = await getAuthHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ Promotion Undone Successfully!\n\n📊 Restored ${result.studentsRestored} students to previous semesters.\n\nBackup from: ${new Date(result.backupTimestamp).toLocaleString()}`);
      loadPromotionPreview(); // Refresh preview
    } else {
      alert('❌ Undo failed: ' + result.message);
    }
  } catch (error) {
    console.error('❌ Error in undo:', error);
    alert('❌ Network error. Please check your connection.');
  } finally {
    undoBtn.innerHTML = originalText;
    undoBtn.disabled = false;
  }
}
