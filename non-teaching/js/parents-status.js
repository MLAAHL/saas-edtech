const API = window.APP_CONFIG.API_BASE_URL;

let allStudents = [];

async function fetchStatus() {
    try {
        const res = await fetch(`${API}/parent/status-report`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        allStudents = data.students;
        updateSummary(data.summary);
        renderTable(allStudents);
        // Show last updated timestamp
        const el = document.getElementById('lastUpdated');
        if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
    } catch (err) {
        console.error('Fetch error:', err);
        document.getElementById('parentsTableBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--red)">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary(s) {
    document.getElementById('totalParents').textContent = s.total;
    document.getElementById('loggedInCount').textContent = s.active;
    document.getElementById('loggedInPercent').textContent = `Account Access Active`;
    
    document.getElementById('notifOnCount').textContent = s.notificationsGranted;
    document.getElementById('notifOnPercent').textContent = `${Math.round((s.notificationsGranted / s.total) * 100) || 0}% Alerts Ready`;
    
    document.getElementById('notLoggedInCount').textContent = s.inactive;
    document.getElementById('notLoggedInPercent').textContent = `No Activity (Offline)`;
}

function renderTable(students) {
    const tbody = document.getElementById('parentsTableBody');
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No matching records found</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => {
        const hasToken = s.hasTokens && s.notificationStatus === 'granted';
        const isLogged = s.lastLogin; // Any login ever
        const isRecent = s.lastLogin && new Date(s.lastLogin) > new Date(Date.now() - 24 * 60 * 60 * 1000); // Activity in last 24h

        let statusHtml = '';
        if (hasToken) {
            statusHtml = `<div><span class="status-dot online"></span>Connected</div>`;
        } else if (isRecent) {
            statusHtml = `<div><span class="status-dot online" style="background:var(--amber); box-shadow:0 0 8px var(--amber)"></span>No Alerts</div>`;
        } else {
            statusHtml = `<div><span class="status-dot offline"></span>Disconnected</div>`;
        }

        return `
        <tr>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${s.name}</div>
                <div style="font-size:11px; color:var(--text-muted)">${s.studentID}</div>
            </td>
            <td>
                <div style="font-size:12px;">${s.stream}</div>
                <div style="font-size:11px; color:var(--text-muted)">Sem ${s.semester}</div>
            </td>
            <td>
                ${statusHtml}
                <div style="font-size:10px; color:var(--text-muted); margin-left:14px;">${s.lastLogin ? 'Last seen: ' + formatTimestamp(s.lastLogin) : 'Never seen'}</div>
            </td>
            <td>
                <span class="badge ${s.notificationStatus === 'granted' ? 'granted' : 'denied'}">${hasToken ? 'ACTIVE' : (isLogged ? 'OFF/MISSING' : 'PENDING')}</span>
            </td>
            <td>
                ${s.hasTokens ? 
                    `<span class="fcm-pill"><span class="material-symbols-rounded" style="font-size:12px;">vibration</span> Linked</span>` : 
                    `<span style="color:var(--text-muted); font-size:10px;">No Device</span>`}
            </td>
        </tr>
    `}).join('');
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Search and Filter
document.getElementById('studentSearch').addEventListener('input', filterData);
document.getElementById('filterStatus').addEventListener('change', filterData);

function filterData() {
    const query = document.getElementById('studentSearch').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;

    const filtered = allStudents.filter(s => {
        const matchesSearch = (s.studentID || '').toLowerCase().includes(query) || (s.name || '').toLowerCase().includes(query);
        
        const isOnline = s.hasTokens && s.notificationStatus === 'granted';
        const isRecent = s.lastLogin && (new Date(Date.now() - new Date(s.lastLogin)) < 24 * 60 * 60 * 1000);

        let matchesStatus = true;
        if (status === 'logged-in') {
            matchesStatus = isOnline || isRecent;
        } else if (status === 'not-logged-in') {
            matchesStatus = !isOnline && !isRecent;
        } else if (status === 'notif-granted') {
            matchesStatus = s.notificationStatus === 'granted';
        } else if (status === 'notif-denied') {
            matchesStatus = s.notificationStatus === 'denied';
        }

        return matchesSearch && matchesStatus;
    });

    renderTable(filtered);
}

// Initial fetch
fetchStatus();
// Refresh every 10 seconds for real-time updates
setInterval(fetchStatus, 10000);
