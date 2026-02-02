
// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
console.log('🔧 Students API Base URL:', API_BASE_URL);

let allStudents = [];
let filteredStudents = [];
let allStreams = [];
let allSubjects = [];
let filteredSubjects = [];
let editingStudentId = null;
let editingStreamId = null;
let editingSubjectId = null;
let editingRowId = null;

let selectedStudents = new Set();

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


// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', function () {
    loadAllData();
    setupBulkUploadListener();
    setupSubjectBulkUploadListener();
});

async function loadAllData() {
    // Load streams first, then students (students filter needs streams)
    await loadStreams();
    await loadSubjects();
    await loadStudents();
}

function setupBulkUploadListener() {
    const bulkFileInput = document.getElementById('bulkFileInput');
    if (bulkFileInput) {
        bulkFileInput.addEventListener('change', function (e) {
            const fileName = e.target.files[0]?.name || '';
            document.getElementById('bulkFileName').textContent = fileName ? `✓ Selected: ${fileName}` : '';
        });
    }
}

function setupSubjectBulkUploadListener() {
    const bulkSubjectFileInput = document.getElementById('bulkSubjectFileInput');
    if (bulkSubjectFileInput) {
        bulkSubjectFileInput.addEventListener('change', function (e) {
            const fileName = e.target.files[0]?.name || '';
            const fileNameDisplay = document.getElementById('bulkSubjectFileName');
            if (fileNameDisplay) {
                fileNameDisplay.textContent = fileName ? `✓ Selected: ${fileName}` : '';
            }
        });
    }
}

// ============================================================================
// STATS UPDATE
// ============================================================================
function updateStudentStats() {
    document.getElementById('totalStudents').textContent = allStudents.length;
    document.getElementById('activeStudents').textContent = allStudents.filter(s => s.isActive !== false).length;
    document.getElementById('inactiveStudents').textContent = allStudents.filter(s => s.isActive === false).length;
    document.getElementById('filteredStudents').textContent = filteredStudents.length;
}

function updateStreamStats() {
    document.getElementById('totalStreams').textContent = allStreams.length;
    document.getElementById('activeStreams').textContent = allStreams.filter(s => s.isActive !== false).length;
    document.getElementById('totalSubjectsInStreams').textContent = allSubjects.length;
    document.getElementById('studentsInStreams').textContent = allStudents.length;
}

function updateSubjectStats() {
    document.getElementById('totalSubjects').textContent = allSubjects.length;
    document.getElementById('coreSubjects').textContent = allSubjects.filter(s => s.subjectType === 'CORE').length;
    document.getElementById('electiveSubjects').textContent = allSubjects.filter(s => s.subjectType === 'ELECTIVE').length;
    document.getElementById('languageSubjects').textContent = allSubjects.filter(s => s.subjectType === 'LANGUAGE').length;
}

// ============================================================================
// TAB SWITCHING
// ============================================================================
function switchTab(tabName, event) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    // Show selected tab content
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) selectedTab.classList.add('active');

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Add active class to clicked button
    if (event && event.target) {
        event.target.closest('.tab-btn').classList.add('active');
    }

    // Refresh data for the selected tab
    if (tabName === 'students' && typeof refreshStudents === 'function') {
        refreshStudents();
    } else if (tabName === 'streams' && typeof refreshStreams === 'function') {
        refreshStreams();
    } else if (tabName === 'subjects' && typeof refreshSubjects === 'function') {
        refreshSubjects();
    }
}

// ============================================================================
// SELECTION & CHECKBOX MANAGEMENT
// ============================================================================
function updateSelectionUI() {
    const count = selectedStudents.size;
    const bulkBar = document.getElementById('bulkActionsBar');
    const selectedCountSpan = document.getElementById('selectedCount');

    if (count > 0) {
        bulkBar.classList.add('show');
        selectedCountSpan.textContent = count;
    } else {
        bulkBar.classList.remove('show');
    }

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === filteredStudents.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
}

function toggleStudentSelection(studentId) {
    if (selectedStudents.has(studentId)) {
        selectedStudents.delete(studentId);
    } else {
        selectedStudents.add(studentId);
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (selectAllCheckbox.checked) {
        filteredStudents.forEach(student => {
            selectedStudents.add(student._id);
        });
    } else {
        selectedStudents.clear();
    }

    renderStudentsTable();
    updateSelectionUI();
}

function deselectAll() {
    selectedStudents.clear();
    renderStudentsTable();
    updateSelectionUI();
}

async function bulkDeleteSelected() {
    if (selectedStudents.size === 0) {
        alert('⚠️ No students selected');
        return;
    }

    const count = selectedStudents.size;
    if (!confirm(`Are you sure you want to delete ${count} selected student${count > 1 ? 's' : ''}?`)) {
        return;
    }

    showLoading(true);
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/students/bulk/delete`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                studentIds: Array.from(selectedStudents)
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Successfully deleted ${result.deletedCount} students`);
            selectedStudents.clear();
            await loadStudents();
            updateSelectionUI();
        } else {
            alert('❌ Error: ' + result.error);
        }
    } catch (error) {
        alert('❌ Error deleting students');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// STUDENTS MANAGEMENT
// ============================================================================
async function loadStudents() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/students/all`);
        const data = await response.json();

        if (data.success) {
            allStudents = data.students || [];
            filteredStudents = [...allStudents];
            renderStudentsTable();
            populateStudentFilters();
            updateStudentStats();
        }
    } catch (error) {
        console.error('Error loading students:', error);
    } finally {
        showLoading(false);
    }
}

function renderStudentsTable() {
    const tbody = document.getElementById('studentsTableBody');

    if (filteredStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#6b7280;">No students found</td></tr>';
        return;
    }

    tbody.innerHTML = filteredStudents.map((s, i) => {
        if (editingRowId === s._id) {
            // ✅ EDITABLE ROW WITH ENTER KEY SUPPORT
            return `
                <tr id="edit-row-${s._id}">
                    <td class="checkbox-cell">
                        <input type="checkbox" class="student-checkbox" disabled>
                    </td>
                    <td>${i + 1}</td>
                    <td><input type="text" class="inline-edit-input" id="edit-studentID-${s._id}" value="${s.studentID || ''}" onkeydown="handleInlineEditKeydown(event, '${s._id}')" /></td>
                    <td><input type="text" class="inline-edit-input" id="edit-name-${s._id}" value="${s.name || ''}" onkeydown="handleInlineEditKeydown(event, '${s._id}')" /></td>
                    <td>
                        <select class="inline-edit-select" id="edit-stream-${s._id}" onkeydown="handleInlineEditKeydown(event, '${s._id}')">
                            ${allStreams.map(stream => `<option value="${stream.name}" ${s.stream === stream.name ? 'selected' : ''}>${stream.name}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select class="inline-edit-select" id="edit-semester-${s._id}" onkeydown="handleInlineEditKeydown(event, '${s._id}')">
                            ${[1, 2, 3, 4, 5, 6].map(sem => `<option value="${sem}" ${s.semester === sem ? 'selected' : ''}>${sem}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select class="inline-edit-select" id="edit-language-${s._id}" onkeydown="handleInlineEditKeydown(event, '${s._id}')">
                            <option value="">-</option>
                            ${[...new Set(allSubjects.filter(sub => sub.subjectType === 'LANGUAGE').map(sub => sub.languageType || sub.name))].sort().map(lang =>
                `<option value="${lang}" ${s.languageSubject === lang ? 'selected' : ''}>${lang}</option>`
            ).join('')}
                        </select>
                    </td>
                    <td>
                        <select class="inline-edit-select" id="edit-elective-${s._id}" onkeydown="handleInlineEditKeydown(event, '${s._id}')">
                            <option value="">-</option>
                            ${[...new Set(allSubjects.filter(sub => sub.subjectType === 'ELECTIVE').map(sub => sub.name))].sort().map(elec =>
                `<option value="${elec}" ${s.electiveSubject === elec ? 'selected' : ''}>${elec}</option>`
            ).join('')}
                        </select>
                    </td>
                    <td><input type="tel" class="inline-edit-input" id="edit-phone-${s._id}" value="${s.parentPhone || ''}" onkeydown="handleInlineEditKeydown(event, '${s._id}')" /></td>
                    <td>
                        <span class="badge ${s.isActive !== false ? 'badge-success' : 'badge-danger'}">
                            ${s.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td style="text-align:center;">
                        <div class="inline-edit-actions">
                            <button class="inline-save-btn" onclick="saveInlineEdit('${s._id}')">
                                <span class="material-symbols-rounded" style="font-size:18px;">check</span>
                            </button>
                            <button class="inline-cancel-btn" onclick="cancelInlineEdit()">
                                <span class="material-symbols-rounded" style="font-size:18px;">close</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            // ✅ NORMAL ROW - DOUBLE CLICK TO EDIT
            return `
                <tr class="table-row-editable" ondblclick="startInlineEdit('${s._id}')">
                    <td class="checkbox-cell">
                        <input 
                            type="checkbox" 
                            class="student-checkbox" 
                            ${selectedStudents.has(s._id) ? 'checked' : ''}
                            onchange="toggleStudentSelection('${s._id}')"
                            onclick="event.stopPropagation()"
                        >
                    </td>
                    <td>${i + 1}</td>
                    <td><strong>${s.studentID || '-'}</strong></td>
                    <td>${s.name || '-'}</td>
                    <td><span class="badge badge-primary">${s.stream || '-'}</span></td>
                    <td style="text-align:center;">${s.semester || '-'}</td>
                    <td>${s.languageSubject || '-'}</td>
                    <td>${s.electiveSubject || '-'}</td>
                    <td>${s.parentPhone || '-'}</td>
                    <td>
                        <span class="badge ${s.isActive !== false ? 'badge-success' : 'badge-danger'}">
                            ${s.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td class="actions-cell" onclick="event.stopPropagation()">
                        <div class="actions-container">
                            <button class="action-btn edit" onclick='editStudent(${JSON.stringify(s).replace(/'/g, "&apos;")})' title="Edit Student">
                                <span class="material-symbols-rounded">edit</span>
                            </button>
                            <button class="action-btn delete" onclick="deleteStudent('${s._id}')" title="Delete Student">
                                <span class="material-symbols-rounded">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }).join('');

    updateSelectionUI();
}


function populateStudentFilters() {
    // STREAM FILTER
    const streamFilter = document.getElementById('studentStreamFilter');
    streamFilter.innerHTML = '<option value="">All Streams</option>';

    if (allStreams && allStreams.length > 0) {
        const activeStreams = allStreams.filter(s => s.isActive !== false);
        activeStreams.forEach(stream => {
            streamFilter.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
        });
    } else {
        const streams = [...new Set(allStudents.map(s => s.stream).filter(Boolean))];
        streams.sort().forEach(stream => {
            streamFilter.innerHTML += `<option value="${stream}">${stream}</option>`;
        });
    }

    // LANGUAGE FILTER
    const languageFilter = document.getElementById('studentLanguageFilter');
    languageFilter.innerHTML = '<option value="">All Languages</option>';

    const languages = [...new Set(allStudents.map(s => s.languageSubject).filter(Boolean))];
    languages.sort().forEach(lang => {
        languageFilter.innerHTML += `<option value="${lang}">${lang}</option>`;
    });

    // ELECTIVE FILTER
    const electiveFilter = document.getElementById('studentElectiveFilter');
    electiveFilter.innerHTML = '<option value="">All Electives</option>';

    const electives = [...new Set(allStudents.map(s => s.electiveSubject).filter(Boolean))];
    electives.sort().forEach(elec => {
        electiveFilter.innerHTML += `<option value="${elec}">${elec}</option>`;
    });
}


function applyStudentFilters() {
    const stream = document.getElementById('studentStreamFilter').value;
    const semester = document.getElementById('studentSemesterFilter').value;
    const language = document.getElementById('studentLanguageFilter').value;
    const elective = document.getElementById('studentElectiveFilter').value;
    const search = document.getElementById('studentSearchInput').value.toLowerCase();

    filteredStudents = allStudents.filter(s => {
        return (!stream || s.stream === stream) &&
            (!semester || s.semester?.toString() === semester) &&
            (!language || s.languageSubject === language) &&
            (!elective || s.electiveSubject === elective) &&
            (!search || s.name?.toLowerCase().includes(search) || s.studentID?.toLowerCase().includes(search));
    });

    renderStudentsTable();
    updateStudentStats();
}


function openAddStudentModal() {
    editingStudentId = null;
    document.getElementById('studentModalTitle').innerHTML = '<span class="material-symbols-rounded">person_add</span> Add Student';
    document.getElementById('studentForm').reset();

    // Populate Stream dropdown
    const streamSelect = document.getElementById('studentStream');
    streamSelect.innerHTML = '<option value="">Select Stream</option>';
    allStreams.forEach(stream => {
        streamSelect.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
    });

    // ✅ Populate Language dropdown - UNIQUE VALUES ONLY
    const languageSelect = document.getElementById('studentLanguage');
    languageSelect.innerHTML = '<option value="">Select Language</option>';
    const languageSubjects = allSubjects.filter(s => s.subjectType === 'LANGUAGE');
    const uniqueLanguages = [...new Set(languageSubjects.map(s => s.languageType || s.name))];
    uniqueLanguages.sort().forEach(lang => {
        if (lang) {
            languageSelect.innerHTML += `<option value="${lang}">${lang}</option>`;
        }
    });

    // ✅ Populate Elective dropdown - UNIQUE VALUES ONLY
    const electiveSelect = document.getElementById('studentElective');
    electiveSelect.innerHTML = '<option value="">Select Elective</option>';
    const electiveSubjects = allSubjects.filter(s => s.subjectType === 'ELECTIVE');
    const uniqueElectives = [...new Set(electiveSubjects.map(s => s.name))];
    uniqueElectives.sort().forEach(elec => {
        if (elec) {
            electiveSelect.innerHTML += `<option value="${elec}">${elec}</option>`;
        }
    });

    document.getElementById('studentModal').classList.add('active');
}

function editStudent(student) {
    editingStudentId = student._id;
    document.getElementById('studentModalTitle').innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Student';

    document.getElementById('studentId').value = student.studentID || '';
    document.getElementById('studentName').value = student.name || '';
    document.getElementById('studentSemester').value = student.semester || '';
    document.getElementById('studentPhone').value = student.parentPhone || '';

    // Populate and set Stream
    const streamSelect = document.getElementById('studentStream');
    streamSelect.innerHTML = '<option value="">Select Stream</option>';
    allStreams.forEach(stream => {
        const selected = student.stream === stream.name ? 'selected' : '';
        streamSelect.innerHTML += `<option value="${stream.name}" ${selected}>${stream.name}</option>`;
    });

    // Populate and set Language
    const languageSelect = document.getElementById('studentLanguage');
    languageSelect.innerHTML = '<option value="">Select Language</option>';
    const languageSubjects = allSubjects.filter(s => s.subjectType === 'LANGUAGE');
    languageSubjects.forEach(lang => {
        const displayName = lang.languageType || lang.name;
        const selected = student.languageSubject === displayName ? 'selected' : '';
        languageSelect.innerHTML += `<option value="${displayName}" ${selected}>${displayName}</option>`;
    });

    // Populate and set Elective
    const electiveSelect = document.getElementById('studentElective');
    electiveSelect.innerHTML = '<option value="">Select Elective</option>';
    const electiveSubjects = allSubjects.filter(s => s.subjectType === 'ELECTIVE');
    electiveSubjects.forEach(elec => {
        const selected = student.electiveSubject === elec.name ? 'selected' : '';
        electiveSelect.innerHTML += `<option value="${elec.name}" ${selected}>${elec.name}</option>`;
    });

    document.getElementById('studentModal').classList.add('active');
}

async function saveStudent(event) {
    event.preventDefault();

    const studentData = {
        studentID: document.getElementById('studentId').value.trim(),
        name: document.getElementById('studentName').value.trim(),
        stream: document.getElementById('studentStream').value,
        semester: parseInt(document.getElementById('studentSemester').value),
        parentPhone: document.getElementById('studentPhone').value.trim(),
        languageSubject: document.getElementById('studentLanguage').value, // ✅ Now from dropdown
        electiveSubject: document.getElementById('studentElective').value, // ✅ Now from dropdown
        isActive: true
    };

    showLoading(true);
    try {
        const url = editingStudentId ? `${API_BASE_URL}/students/${editingStudentId}` : `${API_BASE_URL}/students`;
        const method = editingStudentId ? 'PUT' : 'POST';
        const headers = await getAuthHeaders();

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(studentData)
        });

        const result = await response.json();

        if (result.success || response.ok) {
            alert(editingStudentId ? '✅ Student updated!' : '✅ Student added!');
            closeStudentModal();
            await loadStudents();
        } else {
            alert('❌ Error: ' + (result.error || 'Failed to save'));
        }
    } catch (error) {
        alert('❌ Error saving student');
    } finally {
        showLoading(false);
    }
}


async function deleteStudent(id) {
    if (!confirm('Delete this student?')) return;

    showLoading(true);
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/students/${id}`, {
            method: 'DELETE',
            headers: headers
        });
        const result = await response.json();

        if (result.success) {
            alert('✅ Student deleted!');
            await loadStudents();
        } else {
            alert('❌ Error deleting student');
        }
    } catch (error) {
        alert('❌ Error deleting student');
    } finally {
        showLoading(false);
    }
}

function closeStudentModal() {
    document.getElementById('studentModal').classList.remove('active');
    document.getElementById('studentForm').reset();
    editingStudentId = null;
}

function refreshStudents() {
    loadStudents();
}

function exportStudents() {
    const csv = [
        ['ID', 'Name', 'Stream', 'Semester', 'Language', 'Elective', 'Phone'],
        ...filteredStudents.map(s => [
            s.studentID, s.name, s.stream, s.semester,
            s.languageSubject, s.electiveSubject, s.parentPhone
        ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.csv';
    a.click();
}

// ============================================================================
// BULK UPLOAD
// ============================================================================
function openBulkUploadModal() {
    const streamSelect = document.getElementById('bulkStream');
    streamSelect.innerHTML = '<option value="">Select Stream</option>';
    allStreams.forEach(stream => {
        streamSelect.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
    });

    document.getElementById('bulkUploadModal').classList.add('active');
}

function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('active');
    document.getElementById('bulkFileInput').value = '';
    document.getElementById('bulkFileName').textContent = '';
}

async function processBulkUpload() {
    const stream = document.getElementById('bulkStream').value;
    const semester = document.getElementById('bulkSemester').value;

    if (!stream || !semester) {
        alert('⚠️ Please select Stream and Semester');
        return;
    }

    const fileInput = document.getElementById('bulkFileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('⚠️ Please select an Excel file');
        return;
    }

    showLoading(true);

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            if (!Array.isArray(jsonData) || jsonData.length === 0) {
                alert('⚠️ Excel file is empty');
                showLoading(false);
                return;
            }

            const students = jsonData.map(row => ({
                studentID: row.studentID || row.StudentID || row.ID || '',
                name: row.name || row.Name || '',
                parentPhone: row.parentPhone || row.ParentPhone || row.Phone || '',
                languageSubject: row.languageSubject || row.LanguageSubject || row.Language || '',
                electiveSubject: row.electiveSubject || row.ElectiveSubject || row.Elective || '',
                stream: stream,
                semester: parseInt(semester),
                academicYear: new Date().getFullYear(),
                isActive: true
            }));

            const response = await fetch(`${API_BASE_URL}/students/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students })
            });

            const result = await response.json();

            if (result.success) {
                let message = `✅ Upload Complete!\n\n`;
                message += `📊 Processed: ${result.totalProcessed} students\n`;
                message += `✅ Added: ${result.insertedCount} new students\n`;

                if (result.skippedCount > 0) {
                    message += `ℹ️ Skipped: ${result.skippedCount} (already exist)`;
                }

                alert(message);
                closeBulkUploadModal();
                await loadStudents();
            } else {
                alert('❌ Upload failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error processing file. Please check the file format.');
        } finally {
            showLoading(false);
        }
    };

    reader.readAsArrayBuffer(file);
}

// ============================================================================
// SUBJECT BULK UPLOAD
// ============================================================================
function openSubjectBulkUploadModal() {
    console.log('📂 Opening Subject Bulk Upload Modal');
    const streamSelect = document.getElementById('bulkSubjectStream');

    if (!streamSelect) {
        console.error('❌ Error: bulkSubjectStream element not found');
        return;
    }

    streamSelect.innerHTML = '<option value="">Select Stream</option>';

    if (Array.isArray(allStreams)) {
        allStreams.forEach(stream => {
            streamSelect.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
        });
    }

    const modal = document.getElementById('subjectBulkUploadModal');
    if (modal) {
        modal.classList.add('active');
    } else {
        console.error('❌ Error: subjectBulkUploadModal not found');
    }
}

function closeSubjectBulkUploadModal() {
    document.getElementById('subjectBulkUploadModal').classList.remove('active');
    document.getElementById('bulkSubjectFileInput').value = '';
    const fileNameDisplay = document.getElementById('bulkSubjectFileName');
    if (fileNameDisplay) fileNameDisplay.textContent = '';
}

async function processSubjectBulkUpload() {
    const stream = document.getElementById('bulkSubjectStream').value;
    const semester = document.getElementById('bulkSubjectSemester').value;

    if (!stream || !semester) {
        alert('⚠️ Please select Stream and Semester');
        return;
    }

    const fileInput = document.getElementById('bulkSubjectFileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('⚠️ Please select an Excel file');
        return;
    }

    showLoading(true);

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

            if (!jsonData || jsonData.length === 0) {
                alert('⚠️ Excel file is empty');
                showLoading(false);
                return;
            }

            console.log('📊 First row of Excel:', jsonData[0]);

            // Helper to find value by flexible key matching
            const getVal = (row, possibleKeys) => {
                const keys = Object.keys(row);
                for (let key of possibleKeys) {
                    // Try exact match
                    if (row[key] !== undefined) return row[key];
                    // Try case-insensitive and trimmed match
                    const match = keys.find(k => k.trim().toLowerCase() === key.toLowerCase());
                    if (match) return row[match];
                }
                return '';
            };

            const subjects = jsonData.map(row => {
                const subName = getVal(row, ['subjectName', 'name', 'subject', 'Subject Name', 'SubjectName']);
                const subCode = getVal(row, ['subjectCode', 'code', 'Subject Code', 'SubjectCode']);
                const subType = getVal(row, ['subjectType', 'type', 'Subject Type', 'SubjectType']) || 'CORE';
                const langType = getVal(row, ['languageType', 'language', 'Language Type', 'LanguageType']);

                return {
                    name: subName.toString().trim(),
                    subjectCode: subCode.toString().trim(),
                    subjectType: subType.toString().toUpperCase().trim(),
                    languageType: langType.toString().trim(),
                    stream: stream,
                    semester: parseInt(semester),
                    isActive: true
                };
            }).filter(s => s.name && s.subjectCode);

            console.log(`✅ Prepared ${subjects.length} subjects for upload:`, subjects);

            if (subjects.length === 0) {
                alert('⚠️ No valid subjects found. Please ensure headers are "subjectName" and "subjectCode".');
                showLoading(false);
                return;
            }

            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE_URL}/students/management/subjects/bulk`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ subjects })
            });

            const result = await response.json();
            if (result.success) {
                alert(`✅ Successfully uploaded ${result.insertedCount || subjects.length} subjects!`);
                closeSubjectBulkUploadModal();
                await loadSubjects();
            } else {
                alert('❌ Error: ' + (result.message || result.error || 'Upload failed'));
            }
        } catch (error) {
            console.error('Error processing bulk subject upload:', error);
            alert('❌ Upload failed');
        } finally {
            showLoading(false);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ============================================================================
// STREAMS MANAGEMENT
// ============================================================================
async function loadStreams() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/students/management/streams`);
        const data = await response.json();

        if (data.success) {
            allStreams = data.streams || [];
            renderStreamsTable();
            updateStreamStats();

            // ✅ UPDATE STUDENT FILTERS when streams load
            populateStudentFilters();
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

function renderStreamsTable() {
    const tbody = document.getElementById('streamsTableBody');

    if (allStreams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;">No streams found</td></tr>';
        return;
    }

    tbody.innerHTML = allStreams.map((stream, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${stream.name || '-'}</strong></td>
            <td>${stream.streamCode || '-'}</td>
            <td>${Array.isArray(stream.semesters) ? stream.semesters.length : stream.semesters || '-'}</td>
            <td>
                <span class="badge ${stream.isActive !== false ? 'badge-success' : 'badge-danger'}">
                    ${stream.isActive !== false ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${stream.createdAt ? new Date(stream.createdAt).toLocaleDateString() : '-'}</td>
            <td class="actions-cell">
                <div class="actions-container">
                    <button class="action-btn edit" onclick='editStream(${JSON.stringify(stream).replace(/'/g, "&apos;")})' title="Edit Stream">
                        <span class="material-symbols-rounded">edit</span>
                    </button>
                    <button class="action-btn delete" onclick="deleteStream('${stream._id}')" title="Delete Stream">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddStreamModal() {
    editingStreamId = null;
    document.getElementById('streamModalTitle').innerHTML = '<span class="material-symbols-rounded">school</span> Add Stream';
    document.getElementById('streamForm').reset();
    document.getElementById('streamModal').classList.add('active');
}

function editStream(stream) {
    editingStreamId = stream._id;
    document.getElementById('streamModalTitle').innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Stream';

    document.getElementById('streamName').value = stream.name || '';
    document.getElementById('streamCode').value = stream.streamCode || '';
    document.getElementById('streamSemesters').value = Array.isArray(stream.semesters) ? stream.semesters.length : stream.semesters || '';

    document.getElementById('streamModal').classList.add('active');
}

async function saveStream(event) {
    event.preventDefault();

    const streamData = {
        name: document.getElementById('streamName').value.trim().toUpperCase(),
        streamCode: document.getElementById('streamCode').value.trim().toLowerCase(),
        semesters: parseInt(document.getElementById('streamSemesters').value)
    };

    showLoading(true);
    try {
        const url = editingStreamId ? `${API_BASE_URL}/students/management/streams/${editingStreamId}` : `${API_BASE_URL}/students/management/streams`;
        const method = editingStreamId ? 'PUT' : 'POST';
        const headers = await getAuthHeaders();

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(streamData)
        });

        const result = await response.json();

        if (result.success) {
            alert(editingStreamId ? '✅ Stream updated!' : '✅ Stream added!');
            closeStreamModal();
            await loadStreams();
        } else {
            alert('❌ ' + result.message);
        }
    } catch (error) {
        alert('❌ Error');
    } finally {
        showLoading(false);
    }
}

async function deleteStream(id) {
    if (!confirm('Delete this stream?')) return;

    showLoading(true);
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/students/management/streams/${id}`, {
            method: 'DELETE',
            headers: headers
        });
        const result = await response.json();

        if (result.success) {
            alert('✅ Stream deleted!');
            await loadStreams();
        } else {
            alert('❌ ' + result.message);
        }
    } catch (error) {
        alert('❌ Error');
    } finally {
        showLoading(false);
    }
}

function closeStreamModal() {
    document.getElementById('streamModal').classList.remove('active');
    document.getElementById('streamForm').reset();
    editingStreamId = null;
}

function refreshStreams() {
    loadStreams();
}

// ============================================================================
// SUBJECTS MANAGEMENT
// ============================================================================
async function loadSubjects() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/students/management/subjects`);
        const data = await response.json();

        if (data.success) {
            allSubjects = data.subjects || [];
            filteredSubjects = [...allSubjects];
            renderSubjectsTable();
            populateSubjectFilters();
            updateSubjectStats();
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

function renderSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');

    if (filteredSubjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#6b7280;">No subjects found</td></tr>';
        return;
    }

    tbody.innerHTML = filteredSubjects.map((subject, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${subject.name || '-'}</strong></td>
            <td>${subject.subjectCode || '-'}</td>
            <td><span class="badge badge-primary">${subject.stream || '-'}</span></td>
            <td style="text-align:center;">${subject.semester || '-'}</td>
            <td><span class="badge ${subject.subjectType === 'CORE' ? 'badge-primary' : subject.subjectType === 'ELECTIVE' ? 'badge-warning' : 'badge-success'}">${subject.subjectType || '-'}</span></td>
            <td>${subject.languageType || '-'}</td>
            <td>
                <span class="badge ${subject.isActive !== false ? 'badge-success' : 'badge-danger'}">
                    ${subject.isActive !== false ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td class="actions-cell">
                <div class="actions-container">
                    <button class="action-btn edit" onclick='editSubject(${JSON.stringify(subject).replace(/'/g, "&apos;")})' title="Edit Subject">
                        <span class="material-symbols-rounded">edit</span>
                    </button>
                    <button class="action-btn delete" onclick="deleteSubject('${subject._id}')" title="Delete Subject">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populateSubjectFilters() {
    const streamFilter = document.getElementById('subjectStreamFilter');
    streamFilter.innerHTML = '<option value="">All Streams</option>';

    allStreams.forEach(stream => {
        streamFilter.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
    });
}

function applySubjectFilters() {
    const stream = document.getElementById('subjectStreamFilter').value;
    const semester = document.getElementById('subjectSemesterFilter').value;
    const type = document.getElementById('subjectTypeFilter').value;
    const search = document.getElementById('subjectSearchInput').value.toLowerCase();

    filteredSubjects = allSubjects.filter(s => {
        return (!stream || s.stream === stream) &&
            (!semester || s.semester?.toString() === semester) &&
            (!type || s.subjectType === type) &&
            (!search || s.name?.toLowerCase().includes(search) || s.subjectCode?.toLowerCase().includes(search));
    });

    renderSubjectsTable();
}

function openAddSubjectModal() {
    console.log('➕ Opening Add Subject Modal');
    editingSubjectId = null;

    const title = document.getElementById('subjectModalTitle');
    if (title) title.innerHTML = '<span class="material-symbols-rounded">menu_book</span> Add Subject';

    const form = document.getElementById('subjectForm');
    if (form) form.reset();

    const langGroup = document.getElementById('languageTypeGroup');
    if (langGroup) langGroup.classList.add('hidden');

    const streamSelect = document.getElementById('subjectStream');
    if (streamSelect) {
        streamSelect.innerHTML = '<option value="">Select Stream</option>';
        if (Array.isArray(allStreams)) {
            allStreams.forEach(stream => {
                streamSelect.innerHTML += `<option value="${stream.name}">${stream.name}</option>`;
            });
        }
    }

    const modal = document.getElementById('subjectModal');
    if (modal) {
        modal.classList.add('active');
    } else {
        console.error('❌ Error: subjectModal not found');
    }
}

function editSubject(subject) {
    editingSubjectId = subject._id;
    document.getElementById('subjectModalTitle').innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Subject';

    document.getElementById('subjectName').value = subject.name || '';
    document.getElementById('subjectCode').value = subject.subjectCode || '';
    document.getElementById('subjectSemester').value = subject.semester || '';
    document.getElementById('subjectType').value = subject.subjectType || '';
    document.getElementById('subjectLanguageType').value = subject.languageType || '';

    const streamSelect = document.getElementById('subjectStream');
    streamSelect.innerHTML = '<option value="">Select Stream</option>';
    allStreams.forEach(stream => {
        streamSelect.innerHTML += `<option value="${stream.name}" ${subject.stream === stream.name ? 'selected' : ''}>${stream.name}</option>`;
    });

    if (subject.subjectType === 'LANGUAGE') {
        document.getElementById('languageTypeGroup').classList.remove('hidden');
    }

    document.getElementById('subjectModal').classList.add('active');
}

function toggleLanguageField() {
    const type = document.getElementById('subjectType').value;
    const languageGroup = document.getElementById('languageTypeGroup');

    if (type === 'LANGUAGE') {
        languageGroup.classList.remove('hidden');
    } else {
        languageGroup.classList.add('hidden');
        document.getElementById('subjectLanguageType').value = '';
    }
}

async function saveSubject(event) {
    event.preventDefault();

    const subjectData = {
        name: document.getElementById('subjectName').value.trim(),
        subjectCode: document.getElementById('subjectCode').value.trim(),
        stream: document.getElementById('subjectStream').value,
        semester: parseInt(document.getElementById('subjectSemester').value),
        subjectType: document.getElementById('subjectType').value,
        languageType: document.getElementById('subjectLanguageType').value.trim() || null,
        isLanguageSubject: document.getElementById('subjectType').value === 'LANGUAGE'
    };

    showLoading(true);
    try {
        const url = editingSubjectId ? `${API_BASE_URL}/students/management/subjects/${editingSubjectId}` : `${API_BASE_URL}/students/management/subjects`;
        const method = editingSubjectId ? 'PUT' : 'POST';
        const headers = await getAuthHeaders();

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(subjectData)
        });

        const result = await response.json();

        if (result.success) {
            alert(editingSubjectId ? '✅ Subject updated!' : '✅ Subject added!');
            closeSubjectModal();
            await loadSubjects();
        } else {
            alert('❌ ' + result.message);
        }
    } catch (error) {
        alert('❌ Error');
    } finally {
        showLoading(false);
    }
}

async function deleteSubject(id) {
    if (!confirm('Delete this subject?')) return;

    showLoading(true);
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/students/management/subjects/${id}`, {
            method: 'DELETE',
            headers: headers
        });
        const result = await response.json();

        if (result.success) {
            alert('✅ Subject deleted!');
            await loadSubjects();
        } else {
            alert('❌ Error');
        }
    } catch (error) {
        alert('❌ Error');
    } finally {
        showLoading(false);
    }
}

function closeSubjectModal() {
    document.getElementById('subjectModal').classList.remove('active');
    document.getElementById('subjectForm').reset();
    document.getElementById('languageTypeGroup').classList.add('hidden');
    editingSubjectId = null;
}

function refreshSubjects() {
    loadSubjects();
}

// ============================================================================
// UTILITIES
// ============================================================================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        if (show) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    }
}
function startInlineEdit(studentId) {
    if (editingRowId) {
        cancelInlineEdit(); // Cancel any existing edit
    }
    editingRowId = studentId;
    renderStudentsTable();

    // Focus on first input
    setTimeout(() => {
        document.getElementById(`edit-name-${studentId}`)?.focus();
    }, 100);
}

async function saveInlineEdit(studentId) {
    const studentData = {
        studentID: document.getElementById(`edit-studentID-${studentId}`).value.trim(),
        name: document.getElementById(`edit-name-${studentId}`).value.trim(),
        stream: document.getElementById(`edit-stream-${studentId}`).value,
        semester: parseInt(document.getElementById(`edit-semester-${studentId}`).value),
        languageSubject: document.getElementById(`edit-language-${studentId}`).value,
        electiveSubject: document.getElementById(`edit-elective-${studentId}`).value,
        parentPhone: document.getElementById(`edit-phone-${studentId}`).value.trim(),
        isActive: true
    };

    if (!studentData.studentID || !studentData.name) {
        alert('⚠️ Student ID and Name are required');
        return;
    }

    // ✅ OPTIMISTIC UPDATE - Update local data immediately (no loading overlay)
    const studentIndex = allStudents.findIndex(s => s._id === studentId);
    const filteredIndex = filteredStudents.findIndex(s => s._id === studentId);

    // Store old data in case we need to rollback
    const oldStudentData = studentIndex !== -1 ? { ...allStudents[studentIndex] } : null;

    // Update local arrays immediately
    if (studentIndex !== -1) {
        allStudents[studentIndex] = { ...allStudents[studentIndex], ...studentData };
    }
    if (filteredIndex !== -1) {
        filteredStudents[filteredIndex] = { ...filteredStudents[filteredIndex], ...studentData };
    }

    // ✅ Exit edit mode and re-render immediately (Excel-like feel)
    editingRowId = null;
    renderStudentsTable();

    // ✅ Save to server in background (no loading spinner)
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(studentData)
        });

        const result = await response.json();

        if (!result.success && !response.ok) {
            // ❌ ROLLBACK if server save failed
            if (oldStudentData && studentIndex !== -1) {
                allStudents[studentIndex] = oldStudentData;
            }
            if (oldStudentData && filteredIndex !== -1) {
                filteredStudents[filteredIndex] = oldStudentData;
            }
            renderStudentsTable();
            alert('❌ Error: ' + (result.error || 'Failed to save.  Changes reverted.'));
        }
        // ✅ Success - data already updated, no need to reload! 

    } catch (error) {
        // ❌ ROLLBACK on network error
        if (oldStudentData && studentIndex !== -1) {
            allStudents[studentIndex] = oldStudentData;
        }
        if (oldStudentData && filteredIndex !== -1) {
            filteredStudents[filteredIndex] = oldStudentData;
        }
        renderStudentsTable();
        alert('❌ Network error. Changes reverted.');
    }
}

// End of saveInlineEdit

function cancelInlineEdit() {
    editingRowId = null;
    renderStudentsTable();
}

function handleInlineEditKeydown(event, studentId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveInlineEdit(studentId);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelInlineEdit();
    } else if (event.key === 'Tab') {
        // ✅ Allow Tab to move between fields naturally (don't prevent default)
        // The browser will handle focus movement
    }
}

// ✅ Optional: Click outside to save (Excel-like behavior)
document.addEventListener('click', function (event) {
    if (editingRowId) {
        const editRow = document.getElementById(`edit-row-${editingRowId}`);
        if (editRow && !editRow.contains(event.target)) {
            // Clicked outside the editing row - save changes
            saveInlineEdit(editingRowId);
        }
    }
});
// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.handleInlineEditKeydown = handleInlineEditKeydown;

window.startInlineEdit = startInlineEdit;
window.saveInlineEdit = saveInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;

window.toggleStudentSelection = toggleStudentSelection;
window.toggleSelectAll = toggleSelectAll;
window.deselectAll = deselectAll;
window.bulkDeleteSelected = bulkDeleteSelected;
window.switchTab = switchTab;
window.openAddStudentModal = openAddStudentModal;
window.openAddStreamModal = openAddStreamModal;
window.openAddSubjectModal = openAddSubjectModal;
window.openBulkUploadModal = openBulkUploadModal;
window.closeBulkUploadModal = closeBulkUploadModal;
window.processBulkUpload = processBulkUpload;
window.openSubjectBulkUploadModal = openSubjectBulkUploadModal;
window.closeSubjectBulkUploadModal = closeSubjectBulkUploadModal;
window.processSubjectBulkUpload = processSubjectBulkUpload;
window.saveStudent = saveStudent;
window.saveStream = saveStream;
window.saveSubject = saveSubject;
window.editStudent = editStudent;
window.editStream = editStream;
window.editSubject = editSubject;
window.deleteStudent = deleteStudent;
window.deleteStream = deleteStream;
window.deleteSubject = deleteSubject;
window.closeStudentModal = closeStudentModal;
window.closeStreamModal = closeStreamModal;
window.closeSubjectModal = closeSubjectModal;
window.refreshStudents = refreshStudents;
window.refreshStreams = refreshStreams;
window.refreshSubjects = refreshSubjects;
window.exportStudents = exportStudents;
window.applyStudentFilters = applyStudentFilters;
window.applySubjectFilters = applySubjectFilters;
window.toggleLanguageField = toggleLanguageField;


