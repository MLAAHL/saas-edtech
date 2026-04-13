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
    document.getElementById('loggedInPercent').textContent = `${Math.round((s.active / s.total) * 100) || 0}% Active (Last 24h)`;
    
    document.getElementById('notifOnCount').textContent = s.notificationsGranted;
    document.getElementById('notifOnPercent').textContent = `${Math.round((s.notificationsGranted / s.total) * 100) || 0}% Reachable`;
    
    document.getElementById('notLoggedInCount').textContent = s.inactive;
    document.getElementById('notLoggedInPercent').textContent = `${Math.round((s.inactive / s.total) * 100) || 0}% No Recent Activity`;
}

function renderTable(students) {
    const tbody = document.getElementById('parentsTableBody');
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">No matching records found</td></tr>';
        return;
    }

    tbody.innerHTML = students.map(s => `
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
                ${(() => {
                    const isActive = s.lastLogin && new Date(s.lastLogin) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return s.lastLogin ? 
                        `<div><span class="status-dot ${isActive ? 'online' : 'offline'}"></span>${isActive ? 'Active' : 'Inactive'}</div>
                         <div style="font-size:10px; color:var(--text-muted); margin-left:14px;">${formatTimestamp(s.lastLogin)}</div>` : 
                        `<div><span class="status-dot offline"></span>Never</div>`;
                })()}
            </td>
            <td>
                <span class="badge ${s.notificationStatus}">${s.notificationStatus}</span>
            </td>
            <td>
                ${s.hasTokens ? 
                    `<span class="fcm-pill"><span class="material-symbols-rounded" style="font-size:12px;">vibration</span> Active</span>` : 
                    `<span style="color:var(--text-muted); font-size:10px;">None</span>`}
            </td>
        </tr>
    `).join('');
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
        let matchesStatus = true;
        
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const isActive = s.lastLogin && new Date(s.lastLogin) > oneDayAgo;

        if (status === 'logged-in') matchesStatus = isActive;
        else if (status === 'not-logged-in') matchesStatus = !isActive;
        else if (status === 'notif-granted') matchesStatus = s.notificationStatus === 'granted';
        else if (status === 'notif-denied') matchesStatus = s.notificationStatus === 'denied';

        return matchesSearch && matchesStatus;
    });

    renderTable(filtered);
}

// Initial fetch
fetchStatus();
// Refresh every 10 seconds for real-time updates
setInterval(fetchStatus, 10000);
