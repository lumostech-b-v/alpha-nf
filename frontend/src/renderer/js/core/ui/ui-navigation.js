/**
 * UI Navigation - View switching and data loading
 */
(function() {
    'use strict';

    function switchView(viewName) {
        // Update navigation state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
        
        // Update view state
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        
        document.getElementById(`${viewName}-view`).classList.add('active');
        
        window.uiState.currentView = viewName;
        
        // Load view-specific data
        window.ui.loadViewData(viewName);
        
        console.log(`Switched to view: ${viewName}`);
    }

    async function loadViewData(viewName) {
        try {
            window.ui.showLoading(true);
            
            switch (viewName) {
                case 'dashboard':
                    await window.ui.loadDashboardData();
                    break;
                case 'protocol-library':
                    if (window.ui.loadProtocols) {
                        await window.ui.loadProtocols();
                    }
                    break;
                case 'users':
                    await window.ui.loadUsersData();
                    break;
                case 'sessions':
                    await window.ui.loadSessionsData();
                    break;
                case 'live-session':
                    await window.ui.loadLiveSessionData();
                    break;
                // Treatment plan is now handled in patient file tabs, not in main window
                case 'reports':
                    await window.ui.loadReportsData();
                    break;
                case 'settings':
                    window.ui.loadSettingsData();
                    break;
            }
        } catch (error) {
            
        } finally {
            window.ui.showLoading(false);
        }
    }

    async function loadDashboardData() {
        try {
            // Show skeleton loading
            window.ui.showSkeletonLoading('recentPatientsGrid', 'patient-card');
            window.ui.showSkeletonLoading('recentSessionsTable', 'table');
            
            // Check if we have a current user
            const currentUserId = window.neuroFeedbackApp?.getCurrentUserId();
            const createUserBtn = document.getElementById('createUserBtn');
            
            if (!currentUserId) {
                // Show create user button if no user found
                if (createUserBtn) {
                    createUserBtn.style.display = 'inline-block';
                }
                
                return;
            } else {
                // Hide create user button if user exists
                if (createUserBtn) {
                    createUserBtn.style.display = 'none';
                }
            }
    			
            const [stats, patients, sessions] = await Promise.all([
                window.api.getDashboardStats(),
                window.api.getAllPatients(),
                window.api.getSessions()
            ]);
            // Update stat cards
            document.getElementById('totalPatients').textContent = stats.totalPatients;
            document.getElementById('activeSessions').textContent = '0';
            document.getElementById('completedSessions').textContent = stats.completedToday;
            document.getElementById('totalSessions').textContent = sessions.length;
            
            // Update recent patients grid
            window.ui.updateRecentPatientsGrid(patients.slice(0, 6));
            
            // Update recent sessions table with patient names
            window.ui.updateRecentSessionsTableWithNames(stats.recentSessions, patients);

            // The "All Patients" table is rendered on-demand via the "View All" toggle, but
            // if it's currently expanded we must re-render it on every dashboard load so a
            // freshly completed/saved session is reflected in its SESSIONS count and LAST
            // SESSION columns without requiring an app restart. Reuse the data already
            // fetched above so this costs no extra API calls.
            const patientsTableContainer = document.getElementById('patientsTableContainer');
            if (patientsTableContainer && patientsTableContainer.style.display !== 'none') {
                const sessionCounts = {};
                const lastSessionDates = {};
                sessions.forEach(s => {
                    sessionCounts[s.patient_id] = (sessionCounts[s.patient_id] || 0) + 1;
                    if (!lastSessionDates[s.patient_id] || new Date(s.start_time) > new Date(lastSessionDates[s.patient_id])) {
                        lastSessionDates[s.patient_id] = s.start_time;
                    }
                });
                window.ui.updatePatientsTable(patients, sessionCounts, lastSessionDates);
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
            // Set default values on error
            ['totalPatients', 'activeSessions', 'completedSessions', 'totalSessions'].forEach(id => {
                const elem = document.getElementById(id);
                if (elem) elem.textContent = '0';
            });
            
            // Show create user button on error
            const createUserBtn = document.getElementById('createUserBtn');
            if (createUserBtn) {
                createUserBtn.style.display = 'inline-block';
            }
        }
    }

    async function loadUsersData() {
        try {
            const users = await window.api.getUsers();
            window.ui.updateUsersTable(users);
        } catch (error) {
            
        }
    }

    async function loadPatientsData() {
        try {
            const [patients, sessions] = await Promise.all([
                window.api.getAllPatients(),
                window.api.getSessions()
            ]);
            
            // Count sessions per patient
            const sessionCounts = {};
            sessions.forEach(s => {
                sessionCounts[s.patient_id] = (sessionCounts[s.patient_id] || 0) + 1;
            });
            
            // Get last session date per patient
            const lastSessionDates = {};
            sessions.forEach(s => {
                if (!lastSessionDates[s.patient_id] || new Date(s.start_time) > new Date(lastSessionDates[s.patient_id])) {
                    lastSessionDates[s.patient_id] = s.start_time;
                }
            });
            
            window.ui.updatePatientsTable(patients, sessionCounts, lastSessionDates);
        } catch (error) {
            
        }
    }

    async function loadSessionsData() {
        try {
            const [sessions, patients] = await Promise.all([
                window.api.getSessions(),
                window.api.getAllPatients()
            ]);
            
            // Update session statistics
            window.ui.updateSessionStatistics(sessions);
            
            // Update sessions table
            window.ui.updateSessionsTable(sessions, patients);
            
            // Populate filters
            window.ui.populateSessionFilters(patients);
            
            // Update results count
            window.ui.updateSessionResultsCount(sessions.length);
            
        } catch (error) {
            
        }
    }

    async function loadLiveSessionData() {
        try {
            const patients = await window.api.getAllPatients();
            
            // Load patients
            const patientSelect = document.getElementById('sessionPatientSelect');
            patientSelect.innerHTML = '<option value="">Choose a patient...</option>';
            
            patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.id;
                option.textContent = `${patient.first_name} ${patient.last_name}`;
                patientSelect.appendChild(option);
            });
    
            // Initialize protocols dropdown (empty until patient selected)
            const protocolSelect = document.getElementById('protocolTypeSelect');
            protocolSelect.innerHTML = '<option value="">Select a patient first...</option>';
        } catch (error) {
            
        }
    }

    async function loadTreatmentPlanData() {
        // REMOVED: Treatment plan is now handled in patient file tabs (SessionPlanningPanel)
        // This function is kept for backwards compatibility but does nothing
        console.log('Treatment plan is handled in patient file tabs');
    }

    function loadReportsData() {
        // Placeholder for reports data
        console.log('Loading reports data...');
    }

    function loadSettingsData() {
        // Load stored settings
        const apiUrl = localStorage.getItem('apiUrl') || 'http://localhost:8000';
        const wsUrl = localStorage.getItem('wsUrl') || 'ws://localhost:8000/sp/nfcore_start';
        
        document.getElementById('apiUrlInput').value = apiUrl;
        document.getElementById('wsUrlInput').value = wsUrl;
    }

    function loadStoredSettings() {
        const theme = localStorage.getItem('theme') || 'light';
        const autoSync = localStorage.getItem('autoSync') !== 'false';
        
        // Apply theme immediately
        window.ui.applyTheme(theme);
        
        if (document.getElementById('themeSelect')) {
            document.getElementById('themeSelect').value = theme;
        }
        if (document.getElementById('autoSyncCheck')) {
            document.getElementById('autoSyncCheck').checked = autoSync;
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.switchView = switchView;
    window.uiFunctions.loadViewData = loadViewData;
    window.uiFunctions.loadDashboardData = loadDashboardData;
    window.uiFunctions.loadUsersData = loadUsersData;
    window.uiFunctions.loadPatientsData = loadPatientsData;
    window.uiFunctions.loadSessionsData = loadSessionsData;
    window.uiFunctions.loadLiveSessionData = loadLiveSessionData;
    window.uiFunctions.loadTreatmentPlanData = loadTreatmentPlanData;
    window.uiFunctions.loadReportsData = loadReportsData;
    window.uiFunctions.loadSettingsData = loadSettingsData;
    window.uiFunctions.loadStoredSettings = loadStoredSettings;
})();
