/**
 * UI State - Centralized state management for UI Controller
 * All UI state is stored here and accessed by UI functions
 */

window.uiState = {
    currentView: 'dashboard',
    currentModal: null,
    currentEditId: null,
    isLoading: false,
    selectedPatient: null, // Track the currently selected patient
    patientProfile: null, // PatientProfile component instance
    appState: 'no-patient', // 'no-patient' or 'patient-selected'
    availableChannels: ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2', 'F7', 'F8', 'T3', 'T4', 'T5', 'T6', 'Fz', 'Cz', 'Pz'],
    selectedChannels: ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'Cz', 'Pz'],
    sessionPlanningPanel: null,
    currentSessionDetail: null,
    searchTimeout: null
};

