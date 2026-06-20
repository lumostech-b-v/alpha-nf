/**
 * UI Filters - Filtering and searching
 */
(function() {
    'use strict';

    function populateSessionFilters(patients) {
        const patientFilter = document.getElementById('sessionFilterPatient');
        if (patientFilter) {
        patientFilter.innerHTML = '<option value="">All Patients</option>';
        
        patients.forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = `${patient.first_name} ${patient.last_name}`;
            patientFilter.appendChild(option);
        });
        }
    }

    function clearSessionFilters() {
        document.getElementById('sessionFilterPatient').value = '';
        document.getElementById('sessionFilterProtocol').value = '';
        document.getElementById('sessionFilterStartDate').value = '';
        document.getElementById('sessionFilterEndDate').value = '';
        document.getElementById('sessionSearchInput').value = '';
        
        window.ui.filterSessions();
    }

    async function filterSessions() {
        try {
            const patientFilter = document.getElementById('sessionFilterPatient').value;
            const protocolFilter = document.getElementById('sessionFilterProtocol').value;
            const startDateFilter = document.getElementById('sessionFilterStartDate').value;
            const endDateFilter = document.getElementById('sessionFilterEndDate').value;
            const searchTerm = document.getElementById('sessionSearchInput').value.toLowerCase();
    
            let sessions = await window.api.getSessions();
            const patients = await window.api.getAllPatients();
    
            // Apply filters
            if (patientFilter) {
                sessions = sessions.filter(s => s.patient_id == patientFilter);
            }
            
            if (protocolFilter) {
                sessions = sessions.filter(s => s.protocol_type === protocolFilter);
            }
            
            if (startDateFilter) {
                sessions = sessions.filter(s => {
                    const sessionDate = new Date(s.start_time).toISOString().split('T')[0];
                    return sessionDate >= startDateFilter;
                });
            }
            
            if (endDateFilter) {
                sessions = sessions.filter(s => {
                    const sessionDate = new Date(s.start_time).toISOString().split('T')[0];
                    return sessionDate <= endDateFilter;
                });
            }
            
            if (searchTerm) {
                const patientMap = {};
                patients.forEach(p => patientMap[p.id] = p);
                
                sessions = sessions.filter(s => {
                    const patient = patientMap[s.patient_id];
                    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : '';
                    return patientName.toLowerCase().includes(searchTerm) ||
                           s.protocol_type.toLowerCase().includes(searchTerm);
                });
            }
    
            // Update table with filtered results
            window.ui.updateSessionsTable(sessions, patients);
            window.ui.updateSessionResultsCount(sessions.length);
            
        } catch (error) {
            
        }
    }

    function debounceSearch() {
        clearTimeout(window.uiState.searchTimeout);
        window.uiState.searchTimeout = setTimeout(() => {
            window.ui.filterSessions();
        }, 300);
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.populateSessionFilters = populateSessionFilters;
    window.uiFunctions.clearSessionFilters = clearSessionFilters;
    window.uiFunctions.filterSessions = filterSessions;
    window.uiFunctions.debounceSearch = debounceSearch;
})();
