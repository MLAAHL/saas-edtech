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

let selectedStream = '';

document.addEventListener('DOMContentLoaded', function () {
  console.log('🚀 Promotion System Initialized');
  console.log('📍 Backend URL:', API_CONFIG.BASE_URL);
  loadStreamsFromDatabase();
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

    const response = await fetch(url);

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
    return;
  }

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.PREVIEW, selectedStream);
    console.log('📡 Fetching preview from:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      promoteBtn.disabled = false;
      previewDiv.classList.remove('hidden');
      statsRow.style.display = 'flex';

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
          const undoResponse = await fetch(undoUrl);
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
// EXECUTE PROMOTION
// ============================================================================
async function executeSimplePromotion() {
  if (!selectedStream) {
    alert('❌ Please select a stream first');
    return;
  }

  if (!confirm(`🎓 Promote all students in ${selectedStream}?\n\n⚠️ A backup will be created. You can undo within 24 hours.\n\nContinue?`)) {
    return;
  }

  const promoteBtn = document.getElementById('promoteBtn');
  const originalText = promoteBtn.innerHTML;
  promoteBtn.disabled = true;
  promoteBtn.innerHTML = '<i class="material-icons-round" style="font-size: 20px;">hourglass_empty</i> Promoting...';

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.PROMOTE, selectedStream);
    console.log('📡 Executing promotion:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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

  if (!confirm(`⚠️ UNDO LAST PROMOTION for ${selectedStream}?\n\nThis will restore all students to their previous semesters.\n\nContinue?`)) {
    return;
  }

  const undoBtn = document.getElementById('undoBtn');
  const originalText = undoBtn.innerHTML;
  undoBtn.disabled = true;
  undoBtn.innerHTML = '<i class="material-icons-round" style="font-size: 16px;">hourglass_empty</i> Restoring...';

  try {
    const url = getApiUrl(API_CONFIG.ENDPOINTS.UNDO_ACTION, selectedStream);
    console.log('📡 Undoing promotion:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
