const API = window.APP_CONFIG.API_BASE_URL;

let allStudents = [];

// Helper to get authentication headers
async function getAuthHeaders(user) {
    const headers = {
        'Content-Type': 'application/json'
    };

    const currentUser = user || (window.firebaseAuth && window.firebaseAuth.currentUser);
    if (currentUser) {
        try {
            const token = await currentUser.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (error) {
            console.error('Error getting auth token:', error);
        }
    } else {
        console.warn('Firebase Auth or User not available for headers');
    }

    return headers;
}

async function fetchStatus(user) {
    try {
        const headers = await getAuthHeaders(user);
        const res = await fetch(`${API}/parent/status-report`, { headers });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        allStudents = data.students;
        updateSummary(data.summary);
        filterData(); // Applies search/filters then renders
        // Show last updated timestamp
        const el = document.getElementById('lastUpdated');
        if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
    } catch (err) {
        console.error('Fetch error:', err);
        document.getElementById('parentsTableBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--red)">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary(s) {
    const total = allStudents.length;
    let active = 0;
    let inactive = 0;
    let notificationsGranted = 0;

    allStudents.forEach(student => {
        if (student.appStatus === 'active') active++;
        else inactive++;

        if (student.notificationStatus === 'granted') notificationsGranted++;
    });

    document.getElementById('totalParents').textContent = total;
    document.getElementById('loggedInCount').textContent = active;
    document.getElementById('loggedInPercent').textContent = `Account Access Active`;
    
    document.getElementById('notifOnCount').textContent = notificationsGranted;
    document.getElementById('notifOnPercent').textContent = `${Math.round((notificationsGranted / total) * 100) || 0}% Alerts Ready`;
    
    document.getElementById('notLoggedInCount').textContent = inactive;
    document.getElementById('notLoggedInPercent').textContent = `No Activity (Offline)`;
}

function renderTable(students) {
    const tbody = document.getElementById('parentsTableBody');
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">No matching records found</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => {
        let appHtml = '';
        if (s.appStatus === 'active') appHtml = `<div><span class="status-dot online"></span>🟢 Active</div>`;
        else if (s.appStatus === 'logged_out') appHtml = `<div><span class="status-dot online" style="background:var(--amber); box-shadow:0 0 8px var(--amber)"></span>🟡 Logged Out</div>`;
        else if (s.appStatus === 'app_removed') appHtml = `<div><span class="status-dot online" style="background:var(--red); box-shadow:0 0 8px var(--red)"></span>🔴 App Removed</div>`;
        else appHtml = `<div><span class="status-dot offline"></span>⚪ Never Registered</div>`;

        let notifBadgeClass = 'pending';
        let notifText = '⚪ Not Asked';
        if (s.notificationStatus === 'granted') { notifBadgeClass = 'granted'; notifText = '🟢 Granted'; }
        else if (s.notificationStatus === 'denied') { notifBadgeClass = 'denied'; notifText = '🔴 Denied'; }
        else if (s.notificationStatus === 'blocked') { notifBadgeClass = 'denied'; notifText = '🟠 Blocked'; }
        else if (s.notificationStatus === 'revoked') { notifBadgeClass = 'denied'; notifText = '⚫ Revoked'; }

        let lastDeliveredHtml = '';
        if (s.lastNotificationDelivered) {
            lastDeliveredHtml = `<div style="font-size:10px; color:var(--green); margin-top:4px;">Delivered: ${formatTimestamp(s.lastNotificationDelivered)}</div>`;
        } else if (s.lastNotificationFailed) {
            lastDeliveredHtml = `<div style="font-size:10px; color:var(--red); margin-top:4px;">Failed: ${formatTimestamp(s.lastNotificationFailed)}</div>`;
        }

        const canReset = s.appStatus !== 'never_registered';

        return `
        <tr>
            <td>
                <input type="checkbox" class="row-checkbox" value="${s.studentID}" ${canReset ? 'disabled' : ''}>
            </td>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${s.name}</div>
                <div style="font-size:11px; color:var(--text-muted)">${s.studentID}</div>
            </td>
            <td>
                <div style="font-size:12px;">${s.stream}</div>
                <div style="font-size:11px; color:var(--text-muted)">Sem ${s.semester}</div>
            </td>
            <td>
                ${appHtml}
                <div style="font-size:10px; color:var(--text-muted); margin-left:14px;">
                    ${s.lastLogin ? (s.appStatus === 'logged_out' ? 'Logged out: ' + formatTimestamp(s.lastLogout) : (s.appStatus === 'app_removed' ? 'Removed: ' + formatTimestamp(s.appRemovedAt) : 'Last seen: ' + formatTimestamp(s.lastLogin))) : 'Never seen'}
                </div>
            </td>
            <td>
                <span class="badge ${notifBadgeClass}">${notifText}</span>
                ${lastDeliveredHtml}
            </td>
            <td>
                ${canReset ? `
                <button onclick="openResetModal('${s.studentID.replace(/'/g, "\\'")}', '${s.name.replace(/'/g, "\\'")}')" style="background:transparent; border:1px solid var(--border); color:var(--text-primary); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px; transition:0.2s;">
                    <span class="material-symbols-rounded" style="font-size:14px;">key</span> Reset
                </button>
                ` : `<span style="font-size:11px; color:var(--text-muted);">Not Setup</span>`}
            </td>
        </tr>
    `}).join('');
    
    // Add event listeners to row checkboxes
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.addEventListener('change', updateBulkBtn));
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function openResetModal(studentID, studentName) {
    const confirmReset = await customConfirm('Reset Password', `Are you sure you want to reset the password for ${studentName}? They will be logged out and forced to sign up again.`);
    if (!confirmReset) return;
    
    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/parent/admin-reset-password`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ studentID })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        await customConfirm('Success', `Password for ${studentName} was wiped! They must sign up again.`, true);
        fetchStatus(); // Refresh table
    } catch (err) {
        await customConfirm('Error', 'Failed: ' + err.message, true);
    }
}

// Search and Filter
document.getElementById('studentSearch').addEventListener('input', filterData);
document.getElementById('filterStatus').addEventListener('change', filterData);

function filterData() {
    const query = document.getElementById('studentSearch').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;

    const filtered = allStudents.filter(s => {
        const matchesSearch = (s.studentID || '').toLowerCase().includes(query) || (s.name || '').toLowerCase().includes(query);
        
        let matchesStatus = true;
        if (status === 'active') {
            matchesStatus = s.appStatus === 'active';
        } else if (status === 'registered') {
            matchesStatus = s.appStatus !== 'never_registered';
        } else if (status === 'notif-granted') {
            matchesStatus = s.notificationStatus === 'granted';
        } else if (status !== 'all') {
            matchesStatus = s.appStatus === status;
        }

        return matchesSearch && matchesStatus;
    });

    renderTable(filtered);
}

// Select All Logic
document.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.row-checkbox:not(:disabled)').forEach(cb => cb.checked = isChecked);
    updateBulkBtn();
});

function updateBulkBtn() {
    const btn = document.getElementById('bulkResetBtn');
    if (!btn) return;
    const checked = document.querySelectorAll('.row-checkbox:checked').length;
    if (checked > 0) {
        btn.style.display = 'block';
        btn.textContent = `Bulk Reset (${checked})`;
    } else {
        btn.style.display = 'none';
    }
}

document.getElementById('bulkResetBtn')?.addEventListener('click', async () => {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) return;
    
    const confirmReset = await customConfirm('Bulk Reset', `Are you sure you want to reset the password for ${checkedBoxes.length} selected accounts? They will be logged out and forced to sign up again.`);
    if (!confirmReset) return;
    
    const studentIDs = Array.from(checkedBoxes).map(cb => cb.value);
    const btn = document.getElementById('bulkResetBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/parent/bulk-reset`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ studentIDs })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        await customConfirm('Success', `Successfully reset ${checkedBoxes.length} accounts`, true);
        fetchStatus(); // refresh
    } catch (err) {
        await customConfirm('Error', 'Failed: ' + err.message, true);
    } finally {
        btn.disabled = false;
        btn.style.display = 'none';
        document.getElementById('selectAllCheckbox').checked = false;
    }
});

document.getElementById('exportBtn')?.addEventListener('click', () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Student Name,Student ID,Stream,Semester,App Status,Last Active Date,Notification Status,Last Notification Delivered\r\n";

    allStudents.forEach(s => {
        const name = `"${s.name || ''}"`;
        const id = s.studentID || '';
        const stream = s.stream || '';
        const sem = s.semester || '';
        const appStatus = s.appStatus || 'never_registered';
        const lastActive = s.lastLogin ? new Date(s.lastLogin).toISOString() : 'Never';
        const notifStatus = s.notificationStatus || 'not_asked';
        const lastNotif = s.lastNotificationDelivered ? new Date(s.lastNotificationDelivered).toISOString() : (s.lastNotificationFailed ? 'Failed' : 'None');

        csvContent += `${name},${id},${stream},${sem},${appStatus},${lastActive},${notifStatus},${lastNotif}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `parent_status_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

function customConfirm(title, message, isAlert = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const box = document.getElementById('customConfirmBox');
        
        document.getElementById('customConfirmTitle').textContent = title;
        document.getElementById('customConfirmMessage').textContent = message;
        
        const cancelBtn = document.getElementById('customConfirmCancelBtn');
        const okBtn = document.getElementById('customConfirmOkBtn');
        
        if (isAlert) {
            cancelBtn.style.display = 'none';
            okBtn.textContent = 'OK';
        } else {
            cancelBtn.style.display = 'block';
            cancelBtn.textContent = 'Cancel';
            okBtn.textContent = 'Confirm';
        }
        
        modal.style.display = 'flex';
        void modal.offsetWidth; // Reflow
        modal.style.opacity = '1';
        box.style.transform = 'scale(1)';
        
        const cleanup = () => {
            modal.style.opacity = '0';
            box.style.transform = 'scale(0.95)';
            setTimeout(() => { modal.style.display = 'none'; }, 200);
            
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };
        
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
    });
}


// Expose globally for firebase script to trigger once authenticated
window.fetchStatus = fetchStatus;
