/**
 * UI Forms - Form handling
 */
(function() {
    'use strict';

    async function handleUserFormSubmit() {
        try {
            window.ui.showLoading(true);
            
            const formData = {
                first_name: document.getElementById('userFirstName').value,
                last_name: document.getElementById('userLastName').value,
                username: document.getElementById('userUsername').value,
                email: document.getElementById('userEmail').value
            };
    
            if (!window.uiState.currentEditId) {
                formData.password = document.getElementById('userPassword').value;
                await window.api.createUser(formData);
            } else {
                await window.api.updateUser(window.uiState.currentEditId, formData);
            }
    
            window.ui.closeModal('userModal');
            if (window.uiState.currentView === 'users') {
                await window.ui.loadUsersData();
            }
        } catch (error) {
            console.error('Error saving doctor:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    async function handlePatientFormSubmit() {
        try {
            window.ui.showLoading(true);
            
            // Get current user ID from app with fallback
            let currentUserId = window.neuroFeedbackApp?.getCurrentUserId();
            
            if (!currentUserId) {
                // Try to get from localStorage
                currentUserId = localStorage.getItem('currentUserId');
                
                if (!currentUserId) {
                    // Try to get any existing user as fallback
                    console.log('No current user found, attempting to get any user...');
                    const users = await window.api.getUsers();
                    if (users && users.length > 0) {
                        currentUserId = users[0].id;
                        console.log('Using fallback user ID:', currentUserId);
                    } else {
                        throw new Error('No users found in system. Please ensure backend is properly set up.');
                    }
                }
            }
            
            const formData = {
                first_name: document.getElementById('patientFirstName').value,
                last_name: document.getElementById('patientLastName').value,
                phone_number: document.getElementById('patientPhone').value || null,
                date_of_birth: document.getElementById('patientDateOfBirth').value,
                gender: document.getElementById('patientGender').value ? 
                    document.getElementById('patientGender').value === 'true' : null,
                doctor_id: parseInt(currentUserId) // Auto-assign to current user
            };
    
            if (!window.uiState.currentEditId) {
                await window.api.createPatient(formData);
            } else {
                delete formData.doctor_id; // Don't update doctor_id on edit
                await window.api.updatePatient(window.uiState.currentEditId, formData);
            }
    
            window.ui.closeModal('patientModal');
            
            // Reload data in current view
            if (window.uiState.currentView === 'patients') {
                await window.ui.loadPatientsData();
            } else if (window.uiState.currentView === 'dashboard') {
                await window.ui.loadDashboardData();
            }
        } catch (error) {
            console.error('Error saving patient:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    async function handleSessionFormSubmit() {
        try {
            window.ui.showLoading(true);
            
            // Get current user ID
            let currentUserId = window.neuroFeedbackApp?.getCurrentUserId();
            if (!currentUserId) {
                currentUserId = localStorage.getItem('currentUserId');
                if (!currentUserId) {
                    const users = await window.api.getUsers();
                    if (users && users.length > 0) {
                        currentUserId = users[0].id;
                    } else {
                        throw new Error('No users found in system');
                    }
                }
            }
    
            // Get selected channels from the session modal
            const channelChips = document.querySelectorAll('#sessionChannelsSelect .channel-chip');
            const selectedChannels = Array.from(channelChips).map(chip => chip.textContent.replace('×', '').trim());
    
            const formData = {
                patient_id: parseInt(document.getElementById('modalSessionPatientSelect').value),
                doctor_id: parseInt(currentUserId),
                session_type: "training", // Explicitly set session type
                protocol_type: document.getElementById('sessionProtocolSelect').value,
                start_time: new Date().toISOString(),
                channels: JSON.stringify(selectedChannels),
                sample_rate: parseInt(document.getElementById('sessionSampleRate').value),
                session_rounds: parseInt(document.getElementById('sessionRounds').value),
                doctor_notes: document.getElementById('sessionDoctorNotes').value || null
            };
    
            const createdSession = await window.api.createSession(formData);
            window.ui.showNotification('Session created successfully', 'success');
    
            window.ui.closeModal('sessionModal');
            await window.ui.loadSessionsData();
            
            // Redirect to live session and start neurofeedback
            window.ui.switchView('live-session');
            
            // Pre-populate the live session form with the created session data
            window.ui.populateLiveSessionForm(createdSession, formData);
            
            // Auto-start the neurofeedback session
            setTimeout(() => {
                window.ui.startLiveSession();
            }, 1000); // Small delay to ensure UI is ready
            
        } catch (error) {
            window.ui.showNotification('Error creating session: ' + error.message, 'error');
        } finally {
            window.ui.showLoading(false);
        }
    }

    async function handleProtocolFormSubmit() {
        // NOTE: This function is deprecated. Protocol creation should use ui-protocols.js openProtocolModal()
        // This form handler is kept for backwards compatibility but should not be used.
        try {
            window.ui.openProtocolModal();
        } catch (error) {
            console.error('Error:', error);
        }
    }

    function populateLiveSessionForm(createdSession, formData) {
        // Pre-populate the live session form with the created session data
        try {
            // Set patient
            const patientSelect = document.getElementById('sessionPatientSelect');
            if (patientSelect) {
                patientSelect.value = formData.patient_id;
            }
    
            // Set protocol type
            const protocolTypeSelect = document.getElementById('protocolTypeSelect');
            if (protocolTypeSelect) {
                protocolTypeSelect.value = formData.protocol_type;
            }
    
            // Set channels
            const channels = JSON.parse(formData.channels);
            window.ui.setSelectedChannels(channels);
    
            // Set session rounds
            const sessionRoundsInput = document.getElementById('sessionRoundsInput');
            if (sessionRoundsInput) {
                sessionRoundsInput.value = formData.session_rounds;
            }
    
    
            console.log('Live session form populated with session data:', formData);
        } catch (error) {
            console.error('Error populating live session form:', error);
        }
    }

    function resetForms() {
        document.getElementById('userForm').reset();
        document.getElementById('patientForm').reset();
        document.getElementById('sessionForm').reset();
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.handleUserFormSubmit = handleUserFormSubmit;
    window.uiFunctions.handlePatientFormSubmit = handlePatientFormSubmit;
    window.uiFunctions.handleSessionFormSubmit = handleSessionFormSubmit;
    window.uiFunctions.handleProtocolFormSubmit = handleProtocolFormSubmit;
    window.uiFunctions.populateLiveSessionForm = populateLiveSessionForm;
    window.uiFunctions.resetForms = resetForms;
})();