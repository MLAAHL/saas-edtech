// myclass.js - Smart Attendance System
// Date: 2025-12-19
// User: Itzzskim

const getFirebaseAuth = () => window.firebaseAuth;
const getOnAuthStateChanged = () => window.firebaseOnAuthStateChanged;
const getSignOut = () => window.firebaseSignOut;

// Check Firebase availability
if (!window.firebaseAuth) {
  console.error('❌ Firebase not loaded yet!  Make sure HTML loads Firebase first.');
} else {
  console.log('✅ Firebase available in myclass.js');
}

// Global variables
let attendanceQueue = [];
let createdSubjects = [];
let completedClasses = [];
let selectedStreamData = null;
let createSelectedStreamData = null;
let currentSection = 'todaySection';
let streams = [];
let cloudinaryConfig = null;

let userData = {
  userName: 'Teacher',
  userEmail: null,
  firebaseUid: null,
  profileImageUrl: null
};

// API base URL
// teaching/js/api.js

// ✅ API URL from config
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;



// DOM Elements
const elements = {
  queueList: document.getElementById('queueList'),
  queueCount: document.getElementById('queueCount'),
  emptyQueuePrompt: document.getElementById('emptyQueuePrompt'),
  subjectsList: document.getElementById('subjectsList'),
  emptySubjectsPrompt: document.getElementById('emptySubjectsPrompt'),
  completedList: document.getElementById('completedList'),
  completedCount: document.getElementById('completedCount'),
  emptyCompletedPrompt: document.getElementById('emptyCompletedPrompt'),
  createStreamContainer: document.getElementById('createStreamContainer'),
  createSemester: document.getElementById('createSemester'),
  createSubject: document.getElementById('createSubject'),
  createSubjectForm: document.getElementById('createSubjectForm'),
  createSubjectPage: document.getElementById('createSubjectPage'),
  todaySection: document.getElementById('todaySection'),
  subjectsSection: document.getElementById('subjectsSection'),
  completedSection: document.getElementById('completedSection'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  headerAvatar: document.getElementById('headerAvatar'),
  sidebarAvatar: document.getElementById('sidebarAvatar'),
  headerUserName: document.getElementById('headerUserName'),
  sidebarUserName: document.getElementById('sidebarUserName'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingSpinner: document.querySelector('.loading-spinner')
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getIconForStream(streamName) {
  const iconMap = {
    'BBA': 'business_center',
    'BCA': 'computer',
    'BCA AI & ML': 'psychology',
    'BCOM': 'account_balance',
    'BCOM Section B': 'group',
    'BCOM Section C': 'groups',
    'BCom A&F': 'calculate',
    'BDA': 'analytics'
  };
  return iconMap[streamName] || 'school';
}

function showNotification(message, type = 'info') {
  const config = {
    success: {
      bgColor: '#10B981',
      icon: 'check_circle',
      shadow: 'rgba(16, 185, 129, 0.15)'
    },
    error: {
      bgColor: '#EF4444',
      icon: 'error',
      shadow: 'rgba(239, 68, 68, 0.15)'
    },
    warning: {
      bgColor: '#F59E0B',
      icon: 'warning',
      shadow: 'rgba(245, 158, 11, 0.15)'
    },
    info: {
      bgColor: '#6366F1',
      icon: 'info',
      shadow: 'rgba(99, 102, 241, 0.15)'
    }
  };

  const style = config[type] || config.info;

  const existing = document.querySelector('.custom-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'custom-notification';
  notification.style.cssText = `
    position: fixed;
    top: 60%;
    left: 50%;
    transform:  translate(-50%, -50%);
    background: white;
    border-radius: 10px;
    padding: 10px 14px;
    box-shadow:  0 8px 20px ${style.shadow}, 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 280px;
    min-width: 220px;
    font-family:  'Poppins', sans-serif;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  notification.innerHTML = `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: ${style.bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
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
      font-weight:  600;
      color: #1E293B;
    ">${message}</span>
  `;

  if (!document.getElementById('notification-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-animations';
    styleSheet.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translate(-50%, -40%); }
        to { opacity:  1; transform: translate(-50%, -50%); }
      }
      @keyframes slideDown {
        from { opacity:  1; transform: translate(-50%, -50%); }
        to { opacity: 0; transform: translate(-50%, -60%); }
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

function hideLoadingOverlay() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('hidden');
  }
}

function showLoadingOverlay() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.remove('hidden');
  }
}

// ============================================================================
// STORAGE CLEANUP UTILITIES (Prevents slow loading over time)
// ============================================================================

const STORAGE_VERSION = 'v2';
const MAX_COMPLETED_CLASSES = 100; // Keep only last 100 completed classes

function cleanupLocalStorage() {
  console.log('🧹 Running localStorage cleanup...');

  try {
    // Check storage version for migration
    const storedVersion = localStorage.getItem('storageVersion');
    if (storedVersion !== STORAGE_VERSION) {
      console.log('📦 Storage version updated, clearing old data...');
      // Clear potentially stale cached data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Clear old cache keys but preserve essential auth/config
        if (key && key.includes('cache_') || key.includes('temp_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      localStorage.setItem('storageVersion', STORAGE_VERSION);
    }

    // Log storage usage
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        totalSize += (localStorage.getItem(key) || '').length;
      }
    }
    console.log(`📊 localStorage usage: ~${(totalSize / 1024).toFixed(1)} KB`);

    console.log('✅ localStorage cleanup complete');
  } catch (error) {
    console.warn('⚠️ localStorage cleanup error:', error);
  }
}

// Trim completed classes to prevent memory bloat
function trimCompletedClasses() {
  if (completedClasses.length > MAX_COMPLETED_CLASSES) {
    console.log(`🧹 Trimming completed classes: ${completedClasses.length} -> ${MAX_COMPLETED_CLASSES}`);
    // Sort by date (newest first) and keep only the max allowed
    completedClasses.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    completedClasses = completedClasses.slice(0, MAX_COMPLETED_CLASSES);
  }
}

// Manual cache clear function (accessible from sidebar)
async function clearAppCache() {
  console.log('🧹 Manual cache clear requested...');

  try {
    showNotification('Clearing cache...', 'info');

    // Clear Service Worker caches
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      for (const key of cacheKeys) {
        console.log('🗑️ Deleting cache:', key);
        await caches.delete(key);
      }
    }

    // Clear localStorage cache entries (preserve auth data)
    const keysToPreserve = ['staffType', 'storageVersion'];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToPreserve.includes(key) && !key.includes('firebase')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Unregister and re-register service worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('🔄 Service worker unregistered');
      }
    }

    showNotification('Cache cleared! Reloading...', 'success');

    // Reload after a short delay to ensure user sees the notification
    setTimeout(() => {
      window.location.reload();
    }, 1000);

  } catch (error) {
    console.error('❌ Cache clear error:', error);
    showNotification('Failed to clear cache', 'error');
  }
}

// Expose to window for HTML onclick
window.clearAppCache = clearAppCache;

// ============================================================================
// CLOUDINARY CONFIGURATION
// ============================================================================

async function fetchCloudinaryConfig() {
  try {
    console.log('☁️ Fetching Cloudinary config...');
    const response = await fetch(`${API_BASE_URL}/config/cloudinary`);
    const data = await response.json();

    if (data.success && data.config) {
      cloudinaryConfig = data.config;
      window.CLOUDINARY_CONFIG = data.config;
      console.log('✅ Cloudinary config loaded:', cloudinaryConfig.cloudName);
      return true;
    } else {
      console.warn('⚠️ Cloudinary config not available');
      return false;
    }
  } catch (error) {
    console.error('❌ Error fetching Cloudinary config:', error);
    return false;
  }
}

// ============================================================================
// PROFILE IMAGE UPLOAD TO CLOUDINARY
// ============================================================================

async function uploadProfileImage(file, email) {
  try {
    if (!cloudinaryConfig) {
      const loaded = await fetchCloudinaryConfig();
      if (!loaded) {
        throw new Error('Cloudinary configuration not available');
      }
    }

    console.log('🖼️ Uploading profile image to Cloudinary...');
    updateAvatarLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('folder', 'teacher-profiles');

    const publicId = `teacher_${email.replace(/[@. ]/g, '_')}_${Date.now()}`;
    formData.append('public_id', publicId);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!cloudinaryResponse.ok) {
      const errorData = await cloudinaryResponse.json();
      throw new Error(errorData.error?.message || 'Failed to upload to Cloudinary');
    }

    const cloudinaryData = await cloudinaryResponse.json();
    console.log('✅ Image uploaded to Cloudinary:', cloudinaryData.secure_url);

    const downloadURL = cloudinaryData.secure_url;

    const response = await fetch(`${API_BASE_URL}/teacher/profile/${encodeURIComponent(email)}/image`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ profileImageUrl: downloadURL })
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ Profile image saved to database');
      userData.profileImageUrl = downloadURL;
      updateAvatarDisplay(downloadURL);

      // Stop loading before showing notification
      updateAvatarLoading(false);

      if (window.showSuccessNotification) {
        window.showSuccessNotification('Profile image updated successfully!');
      } else {
        showNotification('Profile image updated! ', 'success');
      }
    } else {
      throw new Error(data.error || 'Failed to save image URL');
    }

  } catch (error) {
    console.error('❌ Error uploading image:', error);
    updateAvatarLoading(false);
    showNotification('Failed to update image', 'error');

    if (userData.profileImageUrl) {
      updateAvatarDisplay(userData.profileImageUrl);
    } else {
      updateAvatarDisplay(null);
    }
  }
}

function updateAvatarLoading(isLoading) {
  const loadingHTML = '<span class="material-symbols-rounded" style="font-size: 26px; color: white; animation: spin 1s linear infinite;">sync</span>';

  if (isLoading) {
    if (elements.headerAvatar) {
      elements.headerAvatar.innerHTML = loadingHTML;
    }
    if (elements.sidebarAvatar) {
      elements.sidebarAvatar.innerHTML = loadingHTML.replace('26px', '48px');
    }
  }
}

function updateAvatarDisplay(imageUrl) {
  const defaultIconHeader = '<span class="material-symbols-rounded" style="font-size: 26px; color: white;">person</span>';
  const defaultIconSidebar = '<span class="material-symbols-rounded" style="font-size: 48px; color: white;">person</span>';

  if (imageUrl) {
    const imgHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;
    if (elements.headerAvatar) {
      elements.headerAvatar.innerHTML = imgHTML;
    }
    if (elements.sidebarAvatar) {
      elements.sidebarAvatar.innerHTML = imgHTML;
    }
  } else {
    if (elements.headerAvatar) {
      elements.headerAvatar.innerHTML = defaultIconHeader;
    }
    if (elements.sidebarAvatar) {
      elements.sidebarAvatar.innerHTML = defaultIconSidebar;
    }
  }
}

function updateUserDisplay(name, email, imageUrl) {
  if (elements.headerUserName) elements.headerUserName.textContent = name;
  if (elements.sidebarUserName) elements.sidebarUserName.textContent = name;
  if (elements.userEmail) elements.userEmail.textContent = email;

  updateAvatarDisplay(imageUrl);
}

window.uploadProfileImage = uploadProfileImage;

// ============================================================================
// FETCH TEACHER PROFILE FROM DATABASE
// ============================================================================

async function fetchTeacherProfile(email) {
  try {
    console.log('👤 Fetching teacher profile from database...');

    const response = await fetch(`${API_BASE_URL}/teacher/profile/email/${encodeURIComponent(email)}`);
    const data = await response.json();

    if (data.success && data.teacher) {
      console.log('✅ Teacher profile loaded:', data.teacher.name);
      return data.teacher;
    } else {
      console.warn('⚠️ Teacher profile not found');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching teacher profile:', error);
    return null;
  }
}

window.fetchTeacherProfile = fetchTeacherProfile;

// ============================================================================
// USER INFO
// ============================================================================

function loadUserInfo() {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    const onAuthStateChanged = getOnAuthStateChanged();

    if (auth && onAuthStateChanged) {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          hideLoadingOverlay();
          userData.userEmail = user.email;
          userData.firebaseUid = user.uid;
          window.currentUserEmail = user.email;

          // Load profile in background
          fetchTeacherProfile(user.email).then(teacherProfile => {
            if (teacherProfile) {
              if (teacherProfile.name) {
                userData.userName = teacherProfile.name;
              } else {
                userData.userName = user.displayName || user.email.split('@')[0];
              }

              if (teacherProfile.profileImageUrl) {
                userData.profileImageUrl = teacherProfile.profileImageUrl;
              }
            } else {
              userData.userName = user.displayName || user.email.split('@')[0];
            }

            updateUserDisplay(userData.userName, userData.userEmail, userData.profileImageUrl);
          });

          console.log('✅ User authenticated:', user.email);
          resolve(user);
        } else {
          console.log('⚠️ No user authenticated');
          hideLoadingOverlay();
          resolve(null);
        }
      });
    } else {
      console.log('⚠️ Firebase auth not available');
      hideLoadingOverlay();
      resolve(null);
    }
  });
}

// ============================================================================
// FETCH STREAMS FROM DATABASE
// ============================================================================

async function fetchStreamsFromDatabase() {
  try {
    console.log('📚 Fetching streams from database...');

    const response = await fetch(`${API_BASE_URL}/streams`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Raw Streams API response:', data);

    if (data.success && Array.isArray(data.streams) && data.streams.length > 0) {

      if (typeof data.streams[0] === 'string') {
        streams = data.streams.map(streamName => {
          console.log(`  Mapping stream string: "${streamName}"`);
          return {
            name: streamName,
            displayName: streamName,
            streamCode: streamName.toLowerCase().replace(/\s+/g, ''),
            icon: getIconForStream(streamName)
          };
        });
      }
      else if (typeof data.streams[0] === 'object' && data.streams[0].name) {
        streams = data.streams.map(stream => {
          console.log(`  Mapping stream:  name="${stream.name}", code="${stream.streamCode}"`);
          return {
            name: stream.name,
            displayName: stream.name,
            streamCode: stream.streamCode,
            icon: getIconForStream(stream.name)
          };
        });
      }
      else {
        throw new Error('Unexpected stream data format');
      }

      console.log(`✅ Loaded ${streams.length} streams:`);
      streams.forEach((stream, index) => {
        console.log(`  ${index + 1}. name="${stream.name}" | code="${stream.streamCode}"`);
      });

      populateStreamDropdowns();
      return streams;

    } else {
      throw new Error('No streams found in database');
    }
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    showNotification('Failed to load streams', 'error');
    streams = [];
    return streams;
  }
}

// ============================================================================
// POPULATE STREAM DROPDOWNS (MOBILE-OPTIMIZED)
// ============================================================================

function populateStreamDropdowns() {
  if (!elements.createStreamContainer) {
    console.error('❌ createStreamContainer element not found! ');
    return;
  }

  console.log('🔄 Populating stream dropdown...');

  elements.createStreamContainer.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose stream';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.hidden = true; // Hide from list after selection
  placeholder.style.color = '#94A3B8';
  elements.createStreamContainer.appendChild(placeholder);

  streams.forEach((stream, index) => {
    const option = document.createElement('option');
    option.value = stream.name;
    option.textContent = stream.name;
    option.style.color = '#1E293B';
    option.style.fontWeight = '500';
    elements.createStreamContainer.appendChild(option);

    console.log(`  ${index + 1}. ✅ "${stream.name}"`);
  });

  // Explicitly force the value to empty so it doesn't default to the first stream
  elements.createStreamContainer.value = '';
  console.log(`✅ Dropdown populated with ${streams.length} streams (set to 'Choose stream')`);
}

// ============================================================================
// INJECT BEAUTIFUL DROPDOWN STYLES (MOBILE-OPTIMIZED)
// ============================================================================

function injectDropdownStyles() {
  if (document.getElementById('custom-dropdown-styles')) return;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'custom-dropdown-styles';
  styleSheet.textContent = `
    #createStreamContainer,
    #createSemester,
    #createSubject {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      width: 100%;
      padding: 16px 18px;
      margin: 0;
      border: 1.5px solid #E2E8F0;
      border-radius: 14px;
      background: white;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 500;
      color: #1E293B;
      line-height: 1.5;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      background-image: url("data:svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 16px center;
      background-size: 20px 20px;
      padding-right: 50px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    
    #createStreamContainer option[value=""],
    #createSemester option[value=""],
    #createSubject option[value=""] {
      color: #94A3B8;
      font-weight: 400;
    }
    
    @media (hover: hover) {
      #createStreamContainer:hover,
      #createSemester:hover,
      #createSubject:hover {
        border-color: #CBD5E1;
        background-color: #FAFAFA;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
        transform: translateY(-1px);
      }
    }
    
    #createStreamContainer:active,
    #createSemester:active,
    #createSubject:active {
      transform: scale(0.98);
      border-color: #3B82F6;
    }
    
    #createStreamContainer:focus,
    #createSemester:focus,
    #createSubject:focus {
      outline: none;
      border-color: #3B82F6;
      background-color: white;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15);
    }
    
    #createStreamContainer:disabled,
    #createSemester:disabled,
    #createSubject:disabled {
      cursor: not-allowed;
      opacity: 0.5;
      background-color: #F8FAFC;
      color: #94A3B8;
      border-color: #E2E8F0;
      transform: none;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    
    #createSubject:disabled {
      animation: pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @media (max-width: 640px) {
      #createStreamContainer,
      #createSemester,
      #createSubject {
        padding: 15px 16px;
        font-size: 16px;
        border-radius: 12px;
        background-position: right 14px center;
        padding-right: 48px;
        min-height: 52px;
      }
    }
    
    @supports (-webkit-touch-callout: none) {
      #createStreamContainer,
      #createSemester,
      #createSubject {
        -webkit-appearance: none;
        border-radius: 14px;
      }
    }
    
    @media (max-width: 640px) and (min-resolution: 2dppx) {
      #createStreamContainer,
      #createSemester,
      #createSubject {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
    }
    
    label[for="createStreamContainer"],
    label[for="createSemester"],
    label[for="createSubject"] {
      display:  block;
      font-size: 14px;
      font-weight: 600;
      color: #334155;
      margin-bottom:  8px;
      font-family: 'Poppins', sans-serif;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    @media (max-width: 640px) {
      .form-group {
        margin-bottom: 18px;
      }
    }
  `;

  document.head.appendChild(styleSheet);
}

// ============================================================================
// LOAD SUBJECTS FROM DATABASE
// ============================================================================
async function loadSubjectsForCreation(stream, semester) {
  try {
    console.log(`📚 Loading subjects for "${stream}" Sem ${semester}...`);

    elements.createSubject.innerHTML = '<option value="">Loading subjects...</option>';
    elements.createSubject.disabled = true;

    // ✅ SPECIALIZED ENDPOINT for teachers
    const url = `${API_BASE_URL}/teacher/streams/${encodeURIComponent(stream)}/sem${semester}/subjects`;
    console.log('📡 Fetching subjects from:', url);

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
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 API Response:', data);

    if (!data.success) {
      throw new Error(data.error || 'API returned success: false');
    }

    // Check if subjects exist
    if (!data.subjects || data.subjects.length === 0) {
      console.warn('⚠️ No subjects found for this stream/semester');
      elements.createSubject.innerHTML = '<option value="">No subjects found</option>';
      elements.createSubject.disabled = true;
      showNotification(`No subjects found for ${stream} Semester ${semester}`, 'warning');
      return;
    }

    populateSubjectsDropdown(data.subjects || [], stream, semester);

  } catch (error) {
    console.error('❌ Error loading subjects:', error);
    elements.createSubject.innerHTML = '<option value="">Failed to load subjects</option>';
    elements.createSubject.disabled = true;
    showNotification('Failed to load subjects: ' + error.message, 'error');

    console.error('📋 Error Details:', {
      stream,
      semester,
      error: error.message,
      stack: error.stack
    });
  }
}


// ============================================================================
// POPULATE SUBJECTS DROPDOWN
// ============================================================================

function populateSubjectsDropdown(subjects, stream, semester) {
  console.log(`✅ Found ${subjects.length} subjects`);

  if (subjects.length === 0) {
    elements.createSubject.innerHTML = '<option value="">No subjects found</option>';
    showNotification(`No subjects for ${stream} Sem ${semester}`, 'warning');
    return;
  }

  elements.createSubject.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select subject';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.style.color = '#94A3B8';
  elements.createSubject.appendChild(placeholder);

  subjects.forEach((subject, index) => {
    const option = document.createElement('option');

    if (typeof subject === 'object') {
      option.value = subject.name || subject.subjectName || subject.subject;
      option.textContent = subject.name || subject.subjectName || subject.subject;
    } else {
      option.value = subject;
      option.textContent = subject;
    }

    option.style.color = '#1E293B';
    option.style.fontWeight = '500';

    elements.createSubject.appendChild(option);
    console.log(`  ${index + 1}. ${option.textContent}`);
  });

  elements.createSubject.disabled = false;
  console.log(`✅ Loaded ${subjects.length} subjects successfully`);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

if (elements.createStreamContainer) {
  elements.createStreamContainer.addEventListener('change', function () {
    const streamName = this.value;
    const semester = elements.createSemester?.value;

    console.log('🎯 Stream selected:', streamName);

    if (streamName) {
      createSelectedStreamData = streams.find(s => s.name === streamName);
      console.log('✅ Found stream data:', createSelectedStreamData);

      if (elements.createSubject) {
        elements.createSubject.innerHTML = '<option value="">Select semester first</option>';
        elements.createSubject.disabled = true;
      }

      if (semester) {
        console.log('🔄 Both stream and semester selected, fetching subjects...');
        loadSubjectsForCreation(streamName, semester);
      }
    } else {
      createSelectedStreamData = null;
      if (elements.createSubject) {
        elements.createSubject.innerHTML = '<option value="">Select stream first</option>';
        elements.createSubject.disabled = true;
      }
    }
  });
}

if (elements.createSemester) {
  elements.createSemester.addEventListener('change', function () {
    const semester = this.value;
    // Robustly get stream name: try state first, then fallback to dropdown value
    let streamName = createSelectedStreamData?.name;
    if (!streamName && elements.createStreamContainer) {
      streamName = elements.createStreamContainer.value;
    }

    console.log('🎯 Semester selected:', semester);
    console.log('🎯 Current stream:', streamName);

    if (semester && streamName) {
      console.log('🔄 Both stream and semester selected, fetching subjects...');
      loadSubjectsForCreation(streamName, semester);
    } else {
      if (elements.createSubject) {
        elements.createSubject.innerHTML = '<option value="">Select stream & semester first</option>';
        elements.createSubject.disabled = true;
      }
    }
  });
}

if (elements.createSubjectForm) {
  elements.createSubjectForm.addEventListener('submit', handleCreateSubject);
}

// ============================================================================
// HANDLE CREATE SUBJECT
// ============================================================================

async function handleCreateSubject(e) {
  e.preventDefault();

  const stream = createSelectedStreamData?.name;
  const semester = elements.createSemester?.value;
  const subject = elements.createSubject?.value;

  console.log('📝 Creating subject:', { stream, semester, subject });

  if (!stream || !semester || !subject) {
    showNotification('Please fill all fields', 'error');
    return;
  }

  if (!userData.userEmail) {
    showNotification('User not authenticated', 'error');
    return;
  }

  const exists = createdSubjects.some(s =>
    s.stream === stream &&
    s.semester === parseInt(semester) &&
    s.subject === subject
  );

  if (exists) {
    showNotification('Subject already in your classes', 'warning');
    return;
  }

  const subjectData = {
    id: Date.now().toString(),
    stream,
    semester: parseInt(semester),
    subject,
    createdAt: new Date().toISOString(),
    teacherEmail: userData.userEmail
  };

  try {
    await saveSubjectToDatabase(subjectData);
    await loadAllData();
    updateSubjectsDisplay();
    cancelCreateSubject();
    showNotification('Subject added successfully', 'success');
    console.log('✅ Subject created:', subjectData);
  } catch (error) {
    console.error('❌ Failed to save subject:', error);
    showNotification('Failed to add subject', 'error');
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function saveSubjectToDatabase(subjectData) {
  try {
    console.log('💾 Saving subject to database...');

    const response = await fetch(`${API_BASE_URL}/teacher/subjects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        firebaseUid: userData.firebaseUid,
        name: userData.userName,
        subject: subjectData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Subject saved');
    return result;

  } catch (error) {
    console.error('❌ Save failed:', error);
    throw error;
  }
}

async function loadSubjectsFromDatabase() {
  try {
    if (!userData.userEmail) {
      createdSubjects = [];
      return;
    }

    console.log('📥 Loading teacher subjects...');

    const response = await fetch(
      `${API_BASE_URL}/teacher/subjects?email=${encodeURIComponent(userData.userEmail)}`,
      { headers: { 'Cache-Control': 'no-cache' } }
    );

    const data = await response.json();

    if (data.success && Array.isArray(data.subjects)) {
      createdSubjects = data.subjects;
      console.log(`✅ Loaded ${createdSubjects.length} subjects`);
    }

  } catch (error) {
    console.error('❌ Failed to load subjects:', error);
    createdSubjects = [];
  }
}

async function loadQueueFromDatabase() {
  try {
    if (!userData.userEmail) {
      attendanceQueue = [];
      return;
    }

    console.log('📥 Loading queue...');

    const response = await fetch(
      `${API_BASE_URL}/teacher/queue?email=${encodeURIComponent(userData.userEmail)}`,
      { headers: { 'Cache-Control': 'no-cache' } }
    );

    const data = await response.json();

    if (data.success && Array.isArray(data.queueData)) {
      attendanceQueue = data.queueData;
      console.log(`✅ Loaded ${attendanceQueue.length} queue items`);
    }

  } catch (error) {
    console.error('❌ Failed to load queue:', error);
    attendanceQueue = [];
  }
}

async function saveQueueToDatabase() {
  try {
    if (!userData.userEmail) return;

    const response = await fetch(`${API_BASE_URL}/teacher/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        queueData: attendanceQueue
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    console.log('✅ Queue saved');

  } catch (error) {
    console.error('❌ Queue save failed:', error);
    throw error;
  }
}

async function loadCompletedFromDatabase() {
  try {
    if (!userData.userEmail) {
      completedClasses = [];
      return;
    }

    console.log('📥 Loading completed...');

    const response = await fetch(
      `${API_BASE_URL}/teacher/completed?email=${encodeURIComponent(userData.userEmail)}`,
      { headers: { 'Cache-Control': 'no-cache' } }
    );

    const data = await response.json();

    if (data.success && Array.isArray(data.completedClasses)) {
      completedClasses = data.completedClasses;
      console.log(`✅ Loaded ${completedClasses.length} completed`);
    }

  } catch (error) {
    console.error('❌ Failed to load completed:', error);
    completedClasses = [];
  }
}

async function saveCompletedToDatabase(completedClass) {
  try {
    const response = await fetch(`${API_BASE_URL}/teacher/completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        completedClass: completedClass
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    console.log('✅ Completed saved');

  } catch (error) {
    console.error('❌ Save failed:', error);
    throw error;
  }
}

async function loadAllData() {
  try {
    if (!userData.userEmail) return;

    console.log('📦 Loading all data...');

    await Promise.allSettled([
      loadSubjectsFromDatabase(),
      loadQueueFromDatabase(),
      loadCompletedFromDatabase()
    ]);

    // Trim completed classes to prevent memory bloat
    trimCompletedClasses();

    console.log('✅ All data loaded:', {
      subjects: createdSubjects.length,
      queue: attendanceQueue.length,
      completed: completedClasses.length
    });

  } catch (error) {
    console.error('❌ Failed to load all data:', error);
  }
}

// ============================================================================
// DISPLAY FUNCTIONS - COMPACT DESIGN WITH CLASS TIMING
// ============================================================================

function getClassTiming(completedAt) {
  const date = new Date(completedAt);
  const minutes = date.getMinutes();
  const hours = date.getHours();

  let startHour, endHour;

  if (minutes <= 30) {
    startHour = hours;
    endHour = hours + 1;
  } else {
    startHour = hours;
    endHour = hours + 1;
  }

  const formatTime = (hour, halfHour = false) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `${displayHour}:${halfHour ? '30' : '00'} ${period}`;
  };

  if (minutes <= 30) {
    return `${formatTime(startHour)} - ${formatTime(endHour)}`;
  } else {
    return `${formatTime(startHour, true)} - ${formatTime(endHour, true)}`;
  }
}

function updateCompletedDisplay() {
  if (!elements.completedList) return;

  if (completedClasses.length === 0) {
    elements.emptyCompletedPrompt?.classList.remove('hidden');
    elements.completedList.innerHTML = '';
    elements.completedList.style.display = 'none';
  } else {
    elements.emptyCompletedPrompt?.classList.add('hidden');
    elements.completedList.style.display = 'flex';
    elements.completedList.style.flexDirection = 'column';
    elements.completedList.style.gap = '12px';

    elements.completedList.innerHTML = completedClasses.map(item => {
      const classTiming = getClassTiming(item.completedAt);
      const completedDate = new Date(item.completedAt);
      const dateStr = completedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const yyyy = completedDate.getFullYear();
      const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(completedDate.getDate()).padStart(2, '0');
      const dateForURL = `${yyyy}-${mm}-${dd}`;

      return `
        <div class="class-card completed">
          <div class="card-content">
            <div class="card-icon" style="background: rgba(16, 185, 129, 0.1); color: #10B981;">
              <span class="material-symbols-rounded" style="font-variation-settings: 'FILL' 1;">check_circle</span>
            </div>
            
            <div class="card-info">
              <div class="card-subject">${item.subject}</div>
              
              <div class="card-badge-row">
                 <span class="card-badge badge-stream">${item.stream}</span>
                 <span class="card-badge badge-sem">SEM ${item.semester}</span>
              </div>
              
              <div class="card-badge-row" style="margin-top: 4px; opacity: 0.8;">
                <div class="card-detail" style="display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-rounded" style="font-size: 14px; color: #F59E0B; font-variation-settings: 'FILL' 1;">schedule</span>
                  <span>${classTiming}</span>
                </div>
                <div class="card-detail" style="display: flex; align-items: center; gap: 4px;">
                   <span class="material-symbols-rounded" style="font-size: 14px;">calendar_today</span>
                   <span>${dateStr}</span>
                </div>
              </div>
            </div>
            
            <button 
              onclick="viewAttendanceDetails('${item.stream}', ${item.semester}, '${item.subject}', '${dateForURL}')"
              class="action-icon-btn"
              style="background: #F8FAFC; color: #10B981;"
            >
              <span class="material-symbols-rounded">arrow_forward_ios</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  if (elements.completedCount) {
    elements.completedCount.textContent = completedClasses.length;
  }
}

function viewAttendanceDetails(stream, semester, subject, date) {
  const viewState = {
    stream: stream,
    semester: semester,
    subject: subject,
    date: date,
    viewMode: 'single',
    timestamp: Date.now()
  };

  localStorage.setItem('attendanceViewState', JSON.stringify(viewState));

  console.log('📅 Navigating to attendance view:', viewState);

  showNotification(`Loading attendance for ${subject}...`, 'info');
  window.location.href = 'view-attendance.html';
}

window.viewAttendanceDetails = viewAttendanceDetails;

function updateQueueDisplay() {
  if (!elements.queueList) return;

  if (attendanceQueue.length === 0) {
    elements.emptyQueuePrompt?.classList.remove('hidden');
    elements.queueList.innerHTML = '';
    elements.queueList.style.display = 'none';
  } else {
    elements.emptyQueuePrompt?.classList.add('hidden');
    elements.queueList.style.display = 'flex';
    elements.queueList.style.flexDirection = 'column';
    elements.queueList.style.gap = '16px';

    elements.queueList.innerHTML = attendanceQueue.map((item, index) => `
      <div class="class-card queue">
        <div class="card-header">
          <div class="card-index">#${index + 1}</div>
          <button onclick="removeFromQueue('${item.id}')" class="action-icon-btn delete">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        
        <div class="card-content">
          <div class="card-icon">
            <span class="material-symbols-rounded" style="font-variation-settings: 'FILL' 1;">menu_book</span>
          </div>
          <div class="card-info">
            <div class="card-subject">${item.subject}</div>
            <div class="card-badge-row">
              <span class="card-badge badge-stream">${item.stream}</span>
              <span class="card-badge badge-sem">SEM ${item.semester}</span>
            </div>
          </div>
        </div>
        
        <button onclick="takeAttendance('${item.id}')" class="card-action-btn">
          <span class="material-symbols-rounded" style="font-variation-settings: 'FILL' 1;">edit_note</span>
          <span>Take Attendance</span>
        </button>
      </div>
    `).join('');
  }

  if (elements.queueCount) {
    elements.queueCount.textContent = attendanceQueue.length;
  }
}

function updateSubjectsDisplay() {
  if (!elements.subjectsList) return;

  if (createdSubjects.length === 0) {
    elements.emptySubjectsPrompt?.classList.remove('hidden');
    elements.subjectsList.innerHTML = '';
    elements.subjectsList.style.display = 'none';
  } else {
    elements.emptySubjectsPrompt?.classList.add('hidden');
    elements.subjectsList.style.display = 'flex';
    elements.subjectsList.style.flexDirection = 'column';
    elements.subjectsList.style.gap = '12px';

    elements.subjectsList.innerHTML = createdSubjects.map((item) => `
      <div class="subject-card">
        <div class="card-icon">
          <span class="material-symbols-rounded" style="font-variation-settings: 'FILL' 1;">school</span>
        </div>
        
        <div class="subject-info">
          <div class="subject-name">${item.subject}</div>
          <div class="subject-meta">${item.stream} • SEM ${item.semester}</div>
        </div>
        
        <div class="subject-actions">
          <button onclick="addToQueue('${item.id}')" class="action-icon-btn add" title="Add to today's classes">
            <span class="material-symbols-rounded">add_circle</span>
          </button>
          
          <button onclick="deleteSubject('${item.id}')" class="action-icon-btn delete" title="Delete subject">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </div>
    `).join('');
  }
}

// ============================================================================
// ACTIONS
// ============================================================================

async function addToQueue(subjectId) {
  const subject = createdSubjects.find(s => s.id === subjectId);
  if (!subject) return;

  const exists = attendanceQueue.some(item =>
    item.stream === subject.stream &&
    item.semester === subject.semester &&
    item.subject === subject.subject
  );

  if (exists) {
    showNotification('Already in queue', 'warning');
    return;
  }

  const queueItem = {
    id: Date.now().toString(),
    stream: subject.stream,
    semester: subject.semester,
    subject: subject.subject,
    addedAt: new Date().toISOString(),
    teacherEmail: userData.userEmail
  };

  attendanceQueue.push(queueItem);

  try {
    await saveQueueToDatabase();
    updateQueueDisplay();
    showNotification('Added to queue', 'success');
  } catch (error) {
    attendanceQueue.pop();
    showNotification('Failed', 'error');
  }
}

async function removeFromQueue(itemId) {
  const original = [...attendanceQueue];
  attendanceQueue = attendanceQueue.filter(item => item.id !== itemId);

  try {
    await saveQueueToDatabase();
    updateQueueDisplay();
    showNotification('Removed', 'success');
  } catch (error) {
    attendanceQueue = original;
    updateQueueDisplay();
    showNotification('Failed', 'error');
  }
}

async function deleteSubject(subjectId) {
  const subject = createdSubjects.find(s => s.id === subjectId);
  if (!subject) return;

  const confirmed = confirm(`Delete "${subject.subject}"?`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/teacher/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherEmail: userData.userEmail })
    });

    if (!response.ok) throw new Error('Delete failed');

    await loadSubjectsFromDatabase();
    updateSubjectsDisplay();
    showNotification('Deleted', 'success');
  } catch (error) {
    showNotification('Failed', 'error');
  }
}

async function takeAttendance(itemId) {
  const item = attendanceQueue.find(q => q.id === itemId);
  if (!item) {
    console.error('❌ Queue item not found:', itemId);
    showNotification('Item not found', 'error');
    return;
  }

  console.log('📝 Taking attendance for:', item);

  try {
    const sessionData = {
      stream: item.stream,
      semester: item.semester,
      subject: item.subject,
      queueItemId: itemId,
      teacherEmail: userData.userEmail,
      teacherName: userData.userName,
      timestamp: Date.now()
    };

    console.log('📦 Session data created:', sessionData);

    sessionStorage.setItem('attendanceSession', JSON.stringify(sessionData));
    localStorage.setItem('lastAttendanceSession', JSON.stringify(sessionData));

    sessionStorage.setItem('currentClass', JSON.stringify({
      stream: item.stream,
      semester: item.semester,
      subject: item.subject
    }));

    console.log('✅ Session data saved to storage');

    showNotification('Starting attendance... ', 'success');
    console.log('🚀 Navigating to attendance.html');
    window.location.href = 'attendance.html';

  } catch (error) {
    console.error('❌ Take attendance error:', error);

    await loadAllData();
    updateQueueDisplay();
    updateCompletedDisplay();

    showNotification('Failed to start attendance', 'error');
  }
}

function viewDetails(completedId) {
  showNotification('Details coming soon', 'info');
}

function showCreateSubjectForm() {
  ['todaySection', 'subjectsSection', 'completedSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  if (elements.createSubjectPage) elements.createSubjectPage.classList.remove('hidden');
  if (elements.createSubjectForm) elements.createSubjectForm.reset();

  // Reset Stream Dropdown to placeholder
  if (elements.createStreamContainer) {
    elements.createStreamContainer.value = '';
  }

  if (elements.createSubject) {
    elements.createSubject.innerHTML = '<option value="">Choose stream & semester first</option>';
    elements.createSubject.disabled = true;
  }

  createSelectedStreamData = null;
}

function cancelCreateSubject() {
  if (elements.createSubjectPage) elements.createSubjectPage.classList.add('hidden');
  if (elements.subjectsSection) elements.subjectsSection.classList.remove('hidden');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Cache for API responses
const apiCache = {
  data: {},
  maxAge: 5 * 60 * 1000, // 5 minutes cache

  get(key) {
    const cached = this.data[key];
    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      console.log(`📦 Cache hit: ${key}`);
      return cached.value;
    }
    return null;
  },

  set(key, value) {
    this.data[key] = { value, timestamp: Date.now() };
  }
};

// Optimized fetch with caching
async function cachedFetch(url, options = {}) {
  const cacheKey = url;
  const cached = apiCache.get(cacheKey);
  if (cached && !options.noCache) return cached;

  const response = await fetch(url, options);
  const data = await response.json();

  if (data.success !== false) {
    apiCache.set(cacheKey, data);
  }
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Smart Attendance System - MyClass');
  console.log('📅 Optimized Loading...');

  // Run cleanup immediately to free up storage (non-blocking)
  cleanupLocalStorage();

  // Inject styles immediately (non-blocking)
  injectDropdownStyles();

  try {
    // Start loading user info (required first)
    const userPromise = loadUserInfo();

    // Start preloading streams in parallel (doesn't need auth)
    const streamsPromise = fetchStreamsFromDatabase();

    // Wait for user auth
    await userPromise;

    if (!userData.userEmail) {
      showNotification('Please log in', 'warning');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return;
    }

    // Load remaining data in parallel
    await Promise.all([
      streamsPromise, // Already started
      fetchCloudinaryConfig(),
      loadAllData()
    ]);

    // Update displays after all data is loaded
    updateQueueDisplay();
    updateSubjectsDisplay();
    updateCompletedDisplay();

    console.log('✅ Initialization complete:', {
      streams: streams.length,
      subjects: createdSubjects.length,
      queue: attendanceQueue.length,
      completed: completedClasses.length
    });

  } catch (error) {
    console.error('❌ Init error:', error);
    showNotification('Initialization failed', 'error');
  }
});

// ============================================================================
// GLOBAL FUNCTIONS
// ============================================================================

window.clearHistoryDate = function (event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const input = document.getElementById('historyDateInput');
  if (input) input.value = '';
  window.filterHistory();
};

window.filterHistory = function () {
  const dateQuery = document.getElementById('historyDateInput')?.value; // YYYY-MM-DD
  const list = document.getElementById('completedList');
  const displayDate = document.getElementById('selectedDateDisplay');
  const clearBtn = document.getElementById('clearDateBtn');

  if (!list) return;

  const cards = list.querySelectorAll('.class-card.completed');
  let visibleCount = 0;

  // Update UI based on selected date
  if (dateQuery) {
    if (displayDate) {
      const d = new Date(dateQuery);
      const options = { month: 'short', day: 'numeric', year: 'numeric' };
      displayDate.textContent = 'Showing: ' + d.toLocaleDateString('en-US', options);
      displayDate.style.color = 'var(--primary-color)';
      displayDate.style.fontWeight = '700';
    }
    if (clearBtn) clearBtn.style.display = 'flex';
  } else {
    if (displayDate) {
      displayDate.textContent = 'Click to select a date';
      displayDate.style.color = 'var(--text-secondary)';
      displayDate.style.fontWeight = '400';
    }
    if (clearBtn) clearBtn.style.display = 'none';
  }

  cards.forEach((card, index) => {
    const item = completedClasses[index];
    if (!item) return;

    let dateMatch = true;
    if (dateQuery) {
      // FIX: Use local date comparison to avoid UTC timezone shifts
      const d = new Date(item.completedAt);
      const itemDate = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      dateMatch = (itemDate === dateQuery);
    }

    if (dateMatch) {
      card.style.display = 'block';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  const emptyPrompt = document.getElementById('emptyCompletedPrompt');
  if (visibleCount === 0 && dateQuery) {
    if (emptyPrompt) {
      emptyPrompt.classList.remove('hidden');
      emptyPrompt.querySelector('.empty-title').textContent = "No classes found";
      emptyPrompt.querySelector('.empty-text').textContent = "No history recorded for this date";
    }
  } else if (completedClasses.length > 0) {
    if (emptyPrompt) emptyPrompt.classList.add('hidden');
  } else {
    if (emptyPrompt) {
      emptyPrompt.classList.remove('hidden');
      emptyPrompt.querySelector('.empty-title').textContent = "No history yet";
      emptyPrompt.querySelector('.empty-text').textContent = "Completed classes appear here";
    }
  }
};

window.addToQueue = addToQueue;
window.removeFromQueue = removeFromQueue;
window.takeAttendance = takeAttendance;
window.deleteSubject = deleteSubject;
window.viewDetails = viewDetails;
window.showCreateSubjectForm = showCreateSubjectForm;
window.cancelCreateSubject = cancelCreateSubject;
window.filterHistory = window.filterHistory;
window.clearHistoryDate = window.clearHistoryDate;

console.log('✅ myclass.js loaded - 2025-12-19 - Itzzskim');
