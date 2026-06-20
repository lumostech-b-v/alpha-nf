/**
 * UI Tables - Table updates
 */
(function() {
    'use strict';

    const patientsTableState = {
        initialized: false,
        allPatients: [],
        filteredPatients: [],
        sessionCounts: {},
        lastSessionDates: {},
        currentPage: 1,
        pageSize: 10,
        searchTerm: '',
        elements: {}
    };

    function updateRecentSessionsTable(sessions) {
        const tbody = document.querySelector('#recentSessionsTable tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No recent sessions found</td></tr>';
            return;
        }
        
        tbody.innerHTML = sessions.slice(0, 5).map(session => `
            <tr>
                <td>Patient ${session.patient_id}</td>
                <td>${session.protocol_type}</td>
                <td>${window.ui.formatDate(session.start_time)}</td>
            </tr>
        `).join('');
    }

    function updateRecentSessionsTableWithNames(sessions, patients) {
        // Check if dashboard view is active
        const dashboardView = document.getElementById('dashboard-view');
        if (!dashboardView || !dashboardView.classList.contains('active')) {
            return; // Silent return - no console messages
        }
        
        const tbody = document.querySelector('#recentSessionsTable tbody');
        
        if (!tbody) {
            return; // Silent return - no error messages
        }
        
        if (!sessions || sessions.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No recent sessions found</td></tr>';
            return;
        }
    
        const patientMap = {};
        patients.forEach(p => patientMap[p.id] = p);
        
        tbody.innerHTML = sessions.slice(0, 5).map(session => {
            const patient = patientMap[session.patient_id];
            const patientName = patient ? `${patient.first_name} ${patient.last_name}` : `Patient ${session.patient_id}`;
            
            return `
                <tr class="clickable-row" onclick="ui.viewSession(${session.id})">
                    <td>${patientName}</td>
                    <td>${session.protocol_type}</td>
                    <td>${window.ui.formatDate(session.start_time)}</td>
                </tr>
            `;
        }).join('');
    }

    function updateRecentPatientsGrid(patients) {
        const grid = document.getElementById('recentPatientsGrid');
        
        if (!patients || patients.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-card">
                    <p>No patients found. Create your first patient to get started.</p>
                    <button class="btn btn-primary" onclick="ui.openPatientModal()">Add Patient</button>
                </div>
            `;
            return;
        }
    
        grid.innerHTML = patients.map(patient => {
            const age = window.ui.calculateAge(patient.date_of_birth);
            return `
                <div class="patient-card">
                    <div class="patient-card-header">
                        <div class="patient-avatar">
                            ${patient.first_name.charAt(0)}${patient.last_name.charAt(0)}
                        </div>
                        <div class="patient-info">
                            <h4 class="clickable-name" onclick="ui.startSessionWithPatient(${patient.id})">${patient.first_name} ${patient.last_name}</h4>
                            <p class="patient-meta">Age: ${age} years</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateUsersTable(users) {
        const tbody = document.querySelector('#usersTable tbody');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="7">No doctors found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.first_name} ${user.last_name}</td>
                <td>${user.email}</td>
                <td>${user.username}</td>
                <td>${user.is_active ? 'Active' : 'Inactive'}</td>
                <td>${window.ui.formatDate(user.created_at)}</td>
                <td>
                    <button class="action-btn" onclick="ui.editUser(${user.id})">Edit</button>
                    <button class="action-btn delete" onclick="ui.deleteUser(${user.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    function updatePatientsTable(patients, sessionCounts = {}, lastSessionDates = {}) {
        initPatientsTableControls();
        patientsTableState.allPatients = Array.isArray(patients) ? patients : [];
        patientsTableState.sessionCounts = sessionCounts || {};
        patientsTableState.lastSessionDates = lastSessionDates || {};
        patientsTableState.filteredPatients = patientsTableState.allPatients.slice();
        applyPatientsTableFilters(false);
    }

    function initPatientsTableControls() {
        if (patientsTableState.initialized) {
            return;
        }

        const elements = patientsTableState.elements;
        elements.tableBody = document.querySelector('#patientsTable tbody');
        elements.searchInput = document.getElementById('patientsTableSearch');
        elements.pageSizeSelect = document.getElementById('patientsTablePageSize');
        elements.info = document.getElementById('patientsTableInfo');
        elements.prevBtn = document.getElementById('patientsTablePrev');
        elements.nextBtn = document.getElementById('patientsTableNext');

        if (!elements.tableBody) {
            return;
        }

        patientsTableState.searchTerm = elements.searchInput?.value || '';
        patientsTableState.pageSize = parseInt(elements.pageSizeSelect?.value || '10', 10) || 10;

        elements.searchInput?.addEventListener('input', (event) => {
            patientsTableState.searchTerm = event.target.value;
            applyPatientsTableFilters(true);
        });

        elements.pageSizeSelect?.addEventListener('change', (event) => {
            const value = parseInt(event.target.value, 10);
            patientsTableState.pageSize = Number.isNaN(value) ? 10 : value;
            patientsTableState.currentPage = 1;
            renderPatientsTable();
        });

        elements.prevBtn?.addEventListener('click', () => handlePatientsTablePageChange(-1));
        elements.nextBtn?.addEventListener('click', () => handlePatientsTablePageChange(1));

        patientsTableState.initialized = true;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 0);
        }
    }

    function handlePatientsTablePageChange(direction) {
        const totalPages = getPatientsTableTotalPages();
        const nextPage = patientsTableState.currentPage + direction;
        if (nextPage < 1 || nextPage > totalPages) {
            return;
        }
        patientsTableState.currentPage = nextPage;
        renderPatientsTable();
    }

    function applyPatientsTableFilters(resetPage = false) {
        const term = patientsTableState.searchTerm.trim().toLowerCase();

        if (!term) {
            patientsTableState.filteredPatients = patientsTableState.allPatients.slice();
        } else {
            patientsTableState.filteredPatients = patientsTableState.allPatients.filter(patient => {
                const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
                const phone = (patient.phone_number || '').toLowerCase();
                const email = (patient.email || '').toLowerCase();
                const id = String(patient.id).toLowerCase();
                return fullName.includes(term) ||
                    phone.includes(term) ||
                    email.includes(term) ||
                    id.includes(term);
            });
        }

        if (resetPage) {
            patientsTableState.currentPage = 1;
        } else {
            const totalPages = getPatientsTableTotalPages();
            patientsTableState.currentPage = Math.min(
                Math.max(1, patientsTableState.currentPage),
                Math.max(1, totalPages)
            );
        }

        renderPatientsTable();
    }

    function renderPatientsTable() {
        const { elements, filteredPatients, currentPage, pageSize } = patientsTableState;
        if (!elements.tableBody) {
            return;
        }

        const total = filteredPatients.length;
        const totalPages = getPatientsTableTotalPages();
        const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
        patientsTableState.currentPage = safePage;

        const startIndex = (safePage - 1) * pageSize;
        const rows = filteredPatients.slice(startIndex, startIndex + pageSize);

        if (rows.length === 0) {
            const message = patientsTableState.searchTerm.trim()
                ? 'No patients match your search'
                : 'No patients found';
            elements.tableBody.innerHTML = `<tr class="empty-state"><td colspan="7">${message}</td></tr>`;
        } else {
            elements.tableBody.innerHTML = rows.map(renderPatientsTableRow).join('');
        }

        updatePatientsTableFooter(total, startIndex, rows.length);

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 0);
        }
    }

    function getPatientsTableTotalPages() {
        if (!patientsTableState.filteredPatients.length) {
            return 1;
        }
        return Math.ceil(patientsTableState.filteredPatients.length / patientsTableState.pageSize);
    }

    function updatePatientsTableFooter(total, startIndex, rowCount) {
        const { elements, currentPage } = patientsTableState;

        if (elements.info) {
            if (!total) {
                elements.info.textContent = patientsTableState.searchTerm.trim()
                    ? 'No patients match your search'
                    : 'No patients to display';
            } else {
                const start = startIndex + 1;
                const end = startIndex + rowCount;
                elements.info.textContent = `Showing ${start}-${end} of ${total} patients`;
            }
        }

        const totalPages = getPatientsTableTotalPages();
        if (elements.prevBtn) {
            elements.prevBtn.disabled = currentPage <= 1 || total === 0;
        }
        if (elements.nextBtn) {
            elements.nextBtn.disabled = currentPage >= totalPages || total === 0;
        }
    }

    function renderPatientsTableRow(patient) {
        const age = window.ui.calculateAge(patient.date_of_birth);
        const sessionCount = patientsTableState.sessionCounts[patient.id] || 0;
        const lastSession = patientsTableState.lastSessionDates[patient.id]
            ? window.ui.formatDate(patientsTableState.lastSessionDates[patient.id])
            : 'Never';

        return `
            <tr>
                <td>${patient.id}</td>
                <td class="clickable-name" onclick="ui.startSessionWithPatient(${patient.id})">${patient.first_name} ${patient.last_name}</td>
                <td>${patient.phone_number || 'N/A'}</td>
                <td>${age} years</td>
                <td>${sessionCount} sessions</td>
                <td>${lastSession}</td>
                <td>
                    <button class="action-btn" onclick="ui.editPatient(${patient.id})" title="Edit">
                        <span data-lucide="edit"></span>
                    </button>
                    <button class="action-btn delete" onclick="ui.deletePatient(${patient.id})" title="Delete">
                        <span data-lucide="trash-2"></span>
                    </button>
                </td>
            </tr>
        `;
    }

    function updateSessionsTable(sessions, patients = []) {
        // Use sessions-view specific selector to avoid conflicts with patient profile table
        const tbody = document.querySelector('#sessions-view #sessionsTable tbody');
        
        if (!tbody) return;
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No sessions found</td></tr>';
            return;
        }

        // Create patient map for quick lookup
        const patientMap = {};
        patients.forEach(p => patientMap[p.id] = p);

        tbody.innerHTML = sessions.map(session => {
            const patient = patientMap[session.patient_id];
            const patientName = patient ? `${patient.first_name} ${patient.last_name}` : `Patient ${session.patient_id}`;

            return `
                <tr class="clickable-row" onclick="ui.viewSession(${session.id})">
                    <td>${session.id}</td>
                    <td>${patientName}</td>
                    <td>${session.protocol_type || 'N/A'}</td>
                    <td>${window.ui.formatDate(session.start_time)}</td>
                    <td>${session.doctor_notes || ''}</td>
                </tr>
            `;
        }).join('');
    }

    function updateSessionStatistics(sessions) {
        // Sessions today
        const today = new Date().toISOString().split('T')[0];
        const completedToday = sessions.filter(session => {
            const sessionDate = new Date(session.start_time).toISOString().split('T')[0];
            return sessionDate === today && session.end_time !== null;
        });
        document.getElementById('completedTodayCount').textContent = completedToday.length;
        
        // Average success rate
        const sessionsWithSuccessRate = sessions.filter(s => s.overall_success_rate !== null);
        const avgSuccessRate = sessionsWithSuccessRate.length > 0 
            ? sessionsWithSuccessRate.reduce((sum, s) => sum + s.overall_success_rate, 0) / sessionsWithSuccessRate.length
            : 0;
        document.getElementById('avgSuccessRate').textContent = (avgSuccessRate * 100).toFixed(1) + '%';
    }

    function updateSessionResultsCount(count) {
        const resultsCount = document.getElementById('sessionResultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${count} session${count !== 1 ? 's' : ''}`;
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.updateRecentSessionsTable = updateRecentSessionsTable;
    window.uiFunctions.updateRecentSessionsTableWithNames = updateRecentSessionsTableWithNames;
    window.uiFunctions.updateRecentPatientsGrid = updateRecentPatientsGrid;
    window.uiFunctions.updateUsersTable = updateUsersTable;
    window.uiFunctions.updatePatientsTable = updatePatientsTable;
    window.uiFunctions.initPatientsTableControls = initPatientsTableControls;
    window.uiFunctions.updateSessionsTable = updateSessionsTable;
    window.uiFunctions.updateSessionStatistics = updateSessionStatistics;
    window.uiFunctions.updateSessionResultsCount = updateSessionResultsCount;
})();
