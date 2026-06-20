/**
 * UI Patients - Patient management
 */
(function() {
    'use strict';

    async function editPatient(patientId) {
        try {
            const patient = await window.api.getPatientById(patientId);
            await window.ui.openPatientModal(patient);
        } catch (error) {
            
        }
    }

    async function deletePatient(patientId) {
        if (!confirm('Are you sure you want to delete this patient?')) {
            return;
        }
        
        try {
            await window.api.deletePatient(patientId);
            
            await window.ui.loadPatientsData();
        } catch (error) {
            
        }
    }

    async function setSelectedPatient(patient) {
        window.uiState.selectedPatient = patient;
        window.uiState.appState = 'patient-selected';
        await window.ui.onPatientSelected(patient);
    }

    function getSelectedPatient() {
        return window.uiState.selectedPatient;
    }

    function clearSelectedPatient() {
        window.uiState.selectedPatient = null;
        window.uiState.appState = 'no-patient';
        window.ui.onPatientCleared();
    }

    async function onPatientSelected(patient) {
        window.ui.updateUIForSelectedPatient(patient);
        await window.ui.openPatientSessionWindow(patient);
    }

    function onPatientCleared() {
        window.ui.switchView('dashboard');
        window.ui.updateUIForNoPatient();
    }

    function updateUIForSelectedPatient(patient) {
        const patientInfoSection = document.getElementById('patientInfoSection');
        if (patientInfoSection) {
            patientInfoSection.style.display = 'block';
        }
    }

    function updateUIForNoPatient() {
        const patientInfoSection = document.getElementById('patientInfoSection');
        if (patientInfoSection) {
            patientInfoSection.style.display = 'none';
        }
        window.ui.closePatientSessionWindow();
    }

    async function loadProtocolsForPatient(patientId) {
        try {
            const protocolSelect = document.getElementById('protocolTypeSelect');
            if (!protocolSelect) return;
            
            protocolSelect.innerHTML = '<option value="">Loading protocols...</option>';
            
            let protocols = await window.api.getAllProtocols();
            if (protocols.length === 0) {
                await window.api.initializeDefaultProtocols();
                protocols = await window.api.getAllProtocols();
            }
            
            protocolSelect.innerHTML = '<option value="">Select protocol...</option>';
            protocols.forEach(protocol => {
                const option = document.createElement('option');
                option.value = protocol.id;
                option.textContent = protocol.name;
                protocolSelect.appendChild(option);
            });
        } catch (error) {
            
            const protocolSelect = document.getElementById('protocolTypeSelect');
            if (protocolSelect) {
                protocolSelect.innerHTML = '<option value="">Error loading protocols</option>';
            }
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.editPatient = editPatient;
    window.uiFunctions.deletePatient = deletePatient;
    window.uiFunctions.setSelectedPatient = setSelectedPatient;
    window.uiFunctions.getSelectedPatient = getSelectedPatient;
    window.uiFunctions.clearSelectedPatient = clearSelectedPatient;
    window.uiFunctions.onPatientSelected = onPatientSelected;
    window.uiFunctions.onPatientCleared = onPatientCleared;
    window.uiFunctions.updateUIForSelectedPatient = updateUIForSelectedPatient;
    window.uiFunctions.updateUIForNoPatient = updateUIForNoPatient;
    window.uiFunctions.loadProtocolsForPatient = loadProtocolsForPatient;
})();
