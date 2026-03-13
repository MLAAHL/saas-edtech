// ============================================================================
// TEACHERS.JS - Manages Firebase Auth users from admin panel
// ============================================================================

const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

let allTeachers = [];
let deleteTargetUid = null;

// ============================================================================
// LOAD TEACHERS
// ============================================================================

async function loadTeachers() {
    const loadingEl = document.getElementById('loadingState');
    const emptyEl = document.getElementById('emptyState');
    const tableEl = document.getElementById('teachersTable');

    try {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        tableEl.style.display = 'none';

        const res = await fetch(`${API_BASE_URL}/firebase-users`);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }

        allTeachers = data.users || [];
        updateStats();
        renderTeachers(allTeachers);

    } catch (error) {
        console.error('❌ Error loading teachers:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('h3').textContent = 'Failed to load';
        emptyEl.querySelector('p').textContent = error.message;
        showToast('Failed to load teachers: ' + error.message, 'error');
    }
}

// ============================================================================
// RENDER TEACHERS TABLE
// ============================================================================

function renderTeachers(teachers) {
    const loadingEl = document.getElementById('loadingState');
    const emptyEl = document.getElementById('emptyState');
    const tableEl = document.getElementById('teachersTable');
    const tbody = document.getElementById('teachersBody');

    loadingEl.style.display = 'none';

    if (teachers.length === 0) {
        emptyEl.style.display = 'block';
        tableEl.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    tableEl.style.display = 'table';

    tbody.innerHTML = teachers.map(user => {
        const initials = getInitials(user.displayName || user.email);
        const name = user.displayName || user.email.split('@')[0];
        const statusClass = user.disabled ? 'disabled' : 'active';
        const statusText = user.disabled ? 'Disabled' : 'Active';
        const created = formatDate(user.creationTime);
        const lastSignIn = user.lastSignInTime ? formatDate(user.lastSignInTime) : 'Never';

        // Use profile image from MongoDB if available
        const avatarHtml = user.profileImageUrl
            ? `<img src="${user.profileImageUrl}" alt="${escapeHtml(name)}" onerror="this.parentElement.innerHTML='${initials}'">`
            : initials;

        return `
      <tr>
        <td>
          <div class="user-info">
            <div class="user-avatar">${avatarHtml}</div>
            <div>
              <div class="user-name">${escapeHtml(name)}</div>
              <div class="user-email">${escapeHtml(user.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="status-badge ${statusClass}">
            <span class="status-dot"></span>
            ${statusText}
          </span>
        </td>
        <td><span class="date-text">${created}</span></td>
        <td><span class="date-text">${lastSignIn}</span></td>
        <td>
          <div class="action-btns">
            <button class="action-icon-btn" title="${user.disabled ? 'Enable' : 'Disable'} user" onclick="toggleDisable('${user.uid}', ${!user.disabled})">
              <span class="material-symbols-rounded">${user.disabled ? 'lock_open' : 'lock'}</span>
            </button>
            <button class="action-icon-btn" title="Reset password" onclick="resetPassword('${user.uid}')">
              <span class="material-symbols-rounded">key</span>
            </button>
            <button class="action-icon-btn danger" title="Delete user" onclick="openDeleteModal('${user.uid}', '${escapeHtml(user.email)}')">
              <span class="material-symbols-rounded">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

// ============================================================================
// UPDATE STATS
// ============================================================================

function updateStats() {
    const total = allTeachers.length;
    const active = allTeachers.filter(u => !u.disabled).length;
    const disabled = allTeachers.filter(u => u.disabled).length;

    document.getElementById('totalUsers').textContent = total;
    document.getElementById('activeUsers').textContent = active;
    document.getElementById('disabledUsers').textContent = disabled;
}

// ============================================================================
// SEARCH / FILTER
// ============================================================================

function filterTeachers() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();

    if (!query) {
        renderTeachers(allTeachers);
        return;
    }

    const filtered = allTeachers.filter(user =>
        (user.email && user.email.toLowerCase().includes(query)) ||
        (user.displayName && user.displayName.toLowerCase().includes(query))
    );

    renderTeachers(filtered);
}

// ============================================================================
// CREATE TEACHER
// ============================================================================

async function createTeacher() {
    const email = document.getElementById('addEmail').value.trim();
    const password = document.getElementById('addPassword').value;
    const displayName = document.getElementById('addName').value.trim();
    const addBtn = document.getElementById('addBtn');

    if (!email) {
        showToast('Please enter an email address', 'error');
        return;
    }

    if (!password || password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        addBtn.disabled = true;
        addBtn.textContent = 'Creating...';

        const res = await fetch(`${API_BASE_URL}/firebase-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, displayName })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to create user');
        }

        showToast(`Teacher ${email} created successfully`, 'success');
        closeAddModal();
        loadTeachers();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = 'Add Teacher';
    }
}

// ============================================================================
// DELETE TEACHER
// ============================================================================

function openDeleteModal(uid, email) {
    deleteTargetUid = uid;
    document.getElementById('deleteUserName').textContent = email;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    deleteTargetUid = null;
    document.getElementById('deleteModal').classList.remove('active');
}

async function confirmDelete() {
    if (!deleteTargetUid) return;
    const btn = document.getElementById('confirmDeleteBtn');

    try {
        btn.disabled = true;
        btn.textContent = 'Deleting...';

        const res = await fetch(`${API_BASE_URL}/firebase-users/${deleteTargetUid}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to delete user');
        }

        showToast(data.message || 'User deleted successfully', 'success');
        closeDeleteModal();
        loadTeachers();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// ============================================================================
// TOGGLE DISABLE
// ============================================================================

async function toggleDisable(uid, disabled) {
    try {
        const res = await fetch(`${API_BASE_URL}/firebase-users/${uid}/disable`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabled })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to update user');
        }

        showToast(`User ${disabled ? 'disabled' : 'enabled'} successfully`, 'success');
        loadTeachers();

    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================================================
// RESET PASSWORD
// ============================================================================

let resetTargetUid = null;

function resetPassword(uid) {
    // Find the user's email from allTeachers
    const user = allTeachers.find(u => u.uid === uid);
    const email = user ? user.email : 'this user';
    resetTargetUid = uid;
    document.getElementById('resetUserEmail').textContent = email;
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('resetModal').classList.add('active');
    setTimeout(() => document.getElementById('newPasswordInput').focus(), 100);
}

async function confirmResetPassword() {
    if (!resetTargetUid) return;

    const newPassword = document.getElementById('newPasswordInput').value;
    const btn = document.getElementById('resetBtn');

    if (!newPassword || newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = 'Updating...';

        const res = await fetch(`${API_BASE_URL}/firebase-users/${resetTargetUid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to update password');
        }

        showToast('Password updated successfully', 'success');
        closeResetModal();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
    }
}

function closeResetModal() {
    resetTargetUid = null;
    document.getElementById('resetModal').classList.remove('active');
}

// ============================================================================
// ADD MODAL
// ============================================================================

function openAddModal() {
    document.getElementById('addName').value = '';
    document.getElementById('addEmail').value = '';
    document.getElementById('addPassword').value = '';
    document.getElementById('addModal').classList.add('active');

    // Focus the name field
    setTimeout(() => document.getElementById('addName').focus(), 100);
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };

    toast.innerHTML = `
    <span class="material-symbols-rounded" style="font-size:18px">${iconMap[type]}</span>
    ${escapeHtml(message)}
  `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================================================
// UTILITIES
// ============================================================================

function getInitials(name, fallback = "??") {
    if (!name || typeof name !== "string") return fallback;
    const parts = name.trim().split(/[@.\s]+/).filter(Boolean);
    if (parts.length === 0) return fallback;
    return parts.map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Close modals on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeAddModal();
        closeDeleteModal();
        closeResetModal();
    }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// Load on start
document.addEventListener('DOMContentLoaded', loadTeachers);
