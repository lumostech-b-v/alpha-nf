/**
 * UI Sessions - Session workflow and data
 */
(function() {
    'use strict';

    async function startSessionWithPatient(patientId) {
        try {
            const patients = await window.api.getAllPatients();
            const patient = patients.find(p => p.id === patientId);
            
            if (!patient) {
                
                return;
            }

            await window.ui.setSelectedPatient(patient);
        } catch (error) {
            console.error('Error selecting patient:', error);
            
        }
    }

    async function openPatientSessionWindow(patient) {
        const sessionWindow = document.getElementById('sessionProcessWindow');
        const sessionTitle = document.getElementById('sessionProcessTitle');
        const sessionSubtitle = document.getElementById('sessionProcessSubtitle');
        
        if (!sessionWindow || !sessionTitle) return;
        
        let sessionNumber = 1;
        try {
            const sessions = await window.api.getSessionsByPatient(patient.id);
            sessionNumber = sessions?.length > 0 ? sessions.length + 1 : 1;
        } catch (error) {
            if (error.response?.status !== 404 && !error.message?.includes('No sessions found')) {
                console.error('Error getting patient sessions:', error);
            }
        }
        
        sessionTitle.textContent = `Session ${sessionNumber} with ${patient.first_name} ${patient.last_name}`;
        sessionWindow.style.display = 'flex';
        await window.ui.initializeSessionSteps();
    }

    function closePatientSessionWindow() {
        document.getElementById('sessionProcessWindow')?.style.setProperty('display', 'none');
    }

    async function initializeSessionSteps() {
        document.querySelectorAll('.session-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        const step1 = document.querySelector('.session-step[data-step="1"]');
        if (step1) {
            step1.style.display = 'flex';
            step1.classList.add('active');
        }
        
        await window.ui.updateAllStepNames();
        await window.ui.updateCurrentStepDetails(1);
        await window.ui.updateNavigationButtons(1);
    }

    async function showPatientProfile() {
        const PatientProfileClass = PatientProfile || window.PatientProfile;
        if (!PatientProfileClass) {
            throw new Error('PatientProfile class is not available. Make sure PatientProfile.js is loaded.');
        }
        
        if (!window.uiState.patientProfile) {
            window.uiState.patientProfile = new PatientProfileClass();
        }
    
        if (!window.uiState.patientProfile.isProfileVisible()) {
            await window.uiState.patientProfile.showProfile(window.uiState.selectedPatient, 'currentSessionStep');
        }
    }

    function hidePatientProfile() {
        window.uiState.patientProfile?.hideProfile();
    }

    async function showSessionPlanningPanel() {
        if (!window.uiState.sessionPlanningPanel) {
            window.uiState.sessionPlanningPanel = new window.SessionPlanningPanel();
            window.sessionPlanningPanel = window.uiState.sessionPlanningPanel;
        }
        await window.uiState.sessionPlanningPanel.show(window.uiState.selectedPatient, null);
    }

    function hideSessionPlanningPanel() {
        window.uiState.sessionPlanningPanel?.hide();
    }

    async function showSessionPreparationPanel() {
        if (!window.uiState.sessionPreparationPanel) {
            window.uiState.sessionPreparationPanel = new window.SessionPreparationPanel();
            window.sessionPreparationPanel = window.uiState.sessionPreparationPanel;
        }
        await window.uiState.sessionPreparationPanel.show(window.uiState.selectedPatient);
    }

    function hideSessionPreparationPanel() {
        window.uiState.sessionPreparationPanel?.hide();
    }

    async function showSessionRecordingPanel() {
        if (!window.uiState.sessionRecordingPanel) {
            window.uiState.sessionRecordingPanel = new window.SessionRecordingPanel();
            window.sessionRecordingPanel = window.uiState.sessionRecordingPanel;
        }
        // Ensure it's also available globally for WebSocketManager
        window.sessionRecordingPanel = window.uiState.sessionRecordingPanel;
        await window.uiState.sessionRecordingPanel.show(window.uiState.selectedPatient);
    }

    function hideSessionRecordingPanel() {
        window.uiState.sessionRecordingPanel?.hide();
    }

    async function showSessionAnalysisPanel() {
        if (!window.uiState.sessionAnalysisPanel) {
            window.uiState.sessionAnalysisPanel = new window.SessionAnalysisPanel();
            window.sessionAnalysisPanel = window.uiState.sessionAnalysisPanel;
        }
        await window.uiState.sessionAnalysisPanel.show(window.uiState.selectedPatient);
    }

    function hideSessionAnalysisPanel() {
        window.uiState.sessionAnalysisPanel?.hide();
    }

    async function updateStep1Name() {
        const step1NameElement = document.getElementById('step1Name');
        if (step1NameElement && window.uiState.selectedPatient) {
            step1NameElement.textContent = 'Patient File';
        }
    }

    async function updateAllStepNames() {
        const names = ['Patient File', 'Planning', 'Preparation', 'Recording', 'Analysis'];
        names.forEach((name, index) => {
            const step = index === 0 
                ? document.getElementById('step1Name')
                : document.querySelector(`.session-step[data-step="${index + 1}"] .session-step-name`);
            if (step) step.textContent = name;
        });
        
        document.querySelector('.session-step[data-step="6"]')?.remove();
    }

    async function updateCurrentStepDetails(stepNumber) {
        const stepTitles = [
            'Patient File Creation',
            'Session Planning',
            'Patient Preparation',
            'Recording Session',
            'Session Analysis'
        ];
        
        const stepDescriptions = [
            'Review and update patient information, then proceed with session planning.',
            'Plan the neurofeedback session parameters and select the appropriate protocol.',
            'Please ensure the patient is comfortable and all equipment is ready.',
            'Begin recording the neurofeedback session with the selected protocol.',
            'Analyze the session data and review the results.'
        ];
        
        const currentStepTitle = document.getElementById('currentSessionStepTitle');
        const currentStepDescription = document.getElementById('currentSessionStepDescription');
        
        if (currentStepTitle && currentStepDescription) {
            currentStepTitle.textContent = stepTitles[stepNumber - 1] || 'Unknown Step';
            currentStepDescription.textContent = stepDescriptions[stepNumber - 1] || 'No description available.';
        }
    
        // Show PatientProfile component for Patient File Creation step
        if (stepNumber === 1 && window.uiState.selectedPatient) {
            await window.ui.showPatientProfile();
            window.ui.hideSessionPlanningPanel();
            window.ui.hideSessionPreparationPanel();
            // Update button text after profile is shown (to reflect current change state)
            await window.ui.updateNavigationButtons(stepNumber);
        } 
        // Show Planning Panel for Planning step (step 2)
        else if (stepNumber === 2 && window.uiState.selectedPatient) {
            window.ui.hidePatientProfile();
            await window.ui.showSessionPlanningPanel();
            window.ui.hideSessionPreparationPanel();
        }
        // Show Preparation Panel for Preparation step (step 3)
        else if (stepNumber === 3 && window.uiState.selectedPatient) {
            window.ui.hidePatientProfile();
            window.ui.hideSessionPlanningPanel();
            await window.ui.showSessionPreparationPanel();
            window.ui.hideSessionRecordingPanel();
        }
        // Show Recording Panel for Recording step (step 4)
        else if (stepNumber === 4 && window.uiState.selectedPatient) {
            window.ui.hidePatientProfile();
            window.ui.hideSessionPlanningPanel();
            window.ui.hideSessionPreparationPanel();
            await window.ui.showSessionRecordingPanel();
            window.ui.hideSessionAnalysisPanel();
            document.getElementById('sessionProcessWindow')?.classList.add('recording-active');
        }
        // Show Analysis Panel for Analysis step (step 5)
        else if (stepNumber === 5 && window.uiState.selectedPatient) {
            window.ui.hidePatientProfile();
            window.ui.hideSessionPlanningPanel();
            window.ui.hideSessionPreparationPanel();
            window.ui.hideSessionRecordingPanel();
            await window.ui.showSessionAnalysisPanel();
            document.getElementById('sessionProcessWindow')?.classList.remove('recording-active');
        } else {
            window.ui.hidePatientProfile();
            window.ui.hideSessionPlanningPanel();
            window.ui.hideSessionPreparationPanel();
            window.ui.hideSessionRecordingPanel();
            window.ui.hideSessionAnalysisPanel();
            document.getElementById('sessionProcessWindow')?.classList.remove('recording-active');
        }
    }

    async function nextStep() {
        const activeStep = document.querySelector('.session-step.active');
        if (activeStep) {
            const currentStepNumber = parseInt(activeStep.dataset.step);
            const nextStepNumber = currentStepNumber + 1;
            
            // If we're on step 4 (Recording), warn before leaving
            if (currentStepNumber === 4) {
                const confirmed = confirm('Are you sure you want to end the recording session? All progress will be saved.');
                if (!confirmed) {
                    return;
                }
                // Stop the session if leaving
                if (window.uiState.sessionRecordingPanel) {
                    window.uiState.sessionRecordingPanel.stopSession();
                }
            }
            
            // If we're on step 1 (Patient File) and there are unsaved changes, save the profile first
            if (currentStepNumber === 1) {
                // Ensure PatientProfile is initialized
                if (!window.uiState.patientProfile) {
                    await window.ui.showPatientProfile();
                }
                
                // Only save if there are unsaved changes
                if (window.uiState.patientProfile && window.uiState.patientProfile.hasChanges()) {
                    if (typeof window.uiState.patientProfile.saveProfile === 'function') {
                        try {
                            await window.uiState.patientProfile.saveProfile();
                        } catch (error) {
                            console.error('Error saving patient profile:', error);
                            const errorMessage = error.message || 'Unknown error occurred';
                            
                            return; // Don't proceed to next step if save fails
                        }
                    } else {
                        const debugInfo = {
                            hasProfile: !!window.uiState.patientProfile,
                            hasSaveMethod: window.uiState.patientProfile ? typeof window.uiState.patientProfile.saveProfile : 'N/A'
                        };
                        console.error('PatientProfile.saveProfile not available:', debugInfo);
                        
                        return;
                    }
                }
            }
            
            // If we're on step 2 (Planning), save the treatment plan first
            if (currentStepNumber === 2 && window.uiState.sessionPlanningPanel) {
                try {
                    await window.uiState.sessionPlanningPanel.savePlan();
                } catch (error) {
                    console.error('Error saving treatment plan:', error);
                    
                    return; // Don't proceed to next step if save fails
                }
            }
            
            // If we're about to enter step 4 (Recording), ask for confirmation
            if (nextStepNumber === 4) {
                const confirmed = confirm('Are you ready to start the recording session? Make sure all equipment is connected and the patient is prepared.');
                if (!confirmed) {
                    return; // Don't proceed to recording if user cancels
                }
            }
            
            // Mark current step as completed
            activeStep.classList.remove('active');
            activeStep.classList.add('completed');
            
            // Activate next step
            const nextStep = document.querySelector(`.session-step[data-step="${nextStepNumber}"]`);
            if (nextStep) {
                nextStep.classList.add('active');
                await window.ui.updateCurrentStepDetails(nextStepNumber);
                await window.ui.updateNavigationButtons(nextStepNumber);
            } else {
                // Session completed
                window.ui.completeSession();
            }
        }
    }

    async function previousStep() {
        const activeStep = document.querySelector('.session-step.active');
        if (activeStep) {
            const currentStepNumber = parseInt(activeStep.dataset.step);
            
            // If we're on step 4 (Recording), warn before leaving
            if (currentStepNumber === 4) {
                const confirmed = confirm('Are you sure you want to end the recording session? All progress will be saved.');
                if (!confirmed) {
                    return;
                }
                // Stop the session if leaving
                if (window.uiState.sessionRecordingPanel) {
                    window.uiState.sessionRecordingPanel.stopSession();
                }
            }
            
            // Prevent going back from step 1
            if (currentStepNumber <= 1) {
                // close the session window
                window.ui.closePatientSessionWindow();
				window.ui.cancelSession();
                return;
            }
            
            // Special case: If we're on step 5 (Analysis), go to step 2 (Planning) instead of step 4
            let prevStepNumber;
            if (currentStepNumber === 5) {
                prevStepNumber = 2; // Go to Planning instead of Recording
            } else {
                prevStepNumber = currentStepNumber - 1;
            }
            
            if (prevStepNumber >= 1) {
                // Mark current step as inactive
                activeStep.classList.remove('active');
                
                // Activate previous step
                const prevStep = document.querySelector(`.session-step[data-step="${prevStepNumber}"]`);
                if (prevStep) {
                    prevStep.classList.remove('completed');
                    prevStep.classList.add('active');
                    await window.ui.updateCurrentStepDetails(prevStepNumber);
                    await window.ui.updateNavigationButtons(prevStepNumber);
                }
            }
        }
    }

    async function updateNavigationButtons(currentStepNumber) {
        const prevBtn = document.getElementById('prevSessionStepBtn');
        const nextBtn = document.getElementById('nextSessionStepBtn');
        
        if (prevBtn) {
            prevBtn.style.display = currentStepNumber > 1 ? 'block' : 'none';
        }
        
        if (nextBtn) {
            if (currentStepNumber >= 5) {
                nextBtn.textContent = 'Finish Analysis';
                nextBtn.className = 'btn btn-primary';
            } else if (currentStepNumber === 3) {
                // Step 3 (Preparation) - Change to "Start Session"
                nextBtn.textContent = 'Start Session';
                nextBtn.className = 'btn btn-success'; // Green color for start
            } else if (currentStepNumber === 1) {
                // Only show "Save and Next Step" on step 1 if there are unsaved changes
                const hasChanges = window.uiState.patientProfile && window.uiState.patientProfile.hasChanges();
                nextBtn.textContent = hasChanges ? 'Save and Next Step' : 'Next Step';
                nextBtn.className = 'btn btn-primary';
            } else {
                nextBtn.textContent = 'Next Step';
                nextBtn.className = 'btn btn-primary';
            }
        }
    }

    function completeSession() {
        console.log('Session completed successfully');

        // Finish Analysis: notify the user, close the session window, and return
        // to the dashboard. Mirrors the exit path used by cancelSession(), minus
        // the cancel confirmation since finishing is the intended end of the flow.
        if (window.ui.showNotification) {
            window.ui.showNotification('Session completed successfully', 'success');
        }
        window.ui.closePatientSessionWindow();
        window.ui.clearSelectedPatient();
    }

    function cancelSession() {
        if (confirm('Are you sure you want to cancel this session? All progress will be lost.')) {
            window.ui.closePatientSessionWindow();
            window.ui.clearSelectedPatient();
            
        }
    }

    async function jumpToAnalysis() {
        // Remove active class from all steps
        document.querySelectorAll('.session-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Activate step 5 (Analysis)
        const analysisStep = document.querySelector('.session-step[data-step="5"]');
        if (analysisStep) {
            analysisStep.classList.add('active');
            // Mark previous steps as completed
            for (let i = 1; i < 5; i++) {
                const step = document.querySelector(`.session-step[data-step="${i}"]`);
                if (step) {
                    step.classList.add('completed');
                }
            }
            await window.ui.updateCurrentStepDetails(5);
            await window.ui.updateNavigationButtons(5);
        }
    }

    async function viewSession(sessionId) {
        try {
            window.ui.showLoading(true);
            
            const [session, patients] = await Promise.all([
                window.api.getSessionById(sessionId),
                window.api.getAllPatients()
            ]);
            
            const patient = patients.find(p => p.id === session.patient_id);
            
            window.uiState.currentSessionDetail = session;
            window.ui.showSessionDetailModal(session, patient);
            
        } catch (error) {
            
        } finally {
            window.ui.showLoading(false);
        }
    }

    async function deleteSession(sessionId) {
        if (!confirm('Are you sure you want to delete this session?')) {
            return;
        }
        
        try {
            await window.api.deleteSession(sessionId);
            
            await window.ui.loadSessionsData();
        } catch (error) {
            
        }
    }

    function exportCurrentSession() {
        if (!window.uiState.currentSessionDetail) {
            
            return;
        }
        
        // Create a simple CSV export for the current session
        const session = window.uiState.currentSessionDetail;
        const csvContent = `Session ID,${session.id}
    Patient ID,${session.patient_id}
    Protocol Type,${session.protocol_type}
    Start Time,${session.start_time}
    End Time,${session.end_time || 'N/A'}
    Duration (seconds),${session.duration_seconds || 'N/A'}
    Success Rate,${session.overall_success_rate || 'N/A'}
    Reward Time (seconds),${session.total_reward_time_seconds || 'N/A'}
    Artifact Time (seconds),${session.total_artifact_time_seconds || 'N/A'}
    Average Impedance,${session.average_impedance || 'N/A'}
    Channels,${session.channels}
    Sample Rate,${session.sample_rate}
    Rounds,${session.session_rounds}
    `;
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${session.id}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    }

    async function exportSessions() {
        try {
            window.ui.showLoading(true);
            const csvData = await window.api.exportSessions('csv');
            
            // Create and download file
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sessions-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            
        } finally {
            window.ui.showLoading(false);
        }
    }

    function startLiveSession() {
        // Placeholder for live session functionality
        document.getElementById('sessionSetup').style.display = 'none';
        document.getElementById('sessionActive').style.display = 'block';
        document.getElementById('startSessionBtn').style.display = 'none';
        document.getElementById('stopSessionBtn').style.display = 'block';

    }

    function stopLiveSession() {
        // Placeholder for stopping live session
        document.getElementById('sessionSetup').style.display = 'block';
        document.getElementById('sessionActive').style.display = 'none';
        document.getElementById('startSessionBtn').style.display = 'block';
        document.getElementById('stopSessionBtn').style.display = 'none';

    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.startSessionWithPatient = startSessionWithPatient;
    window.uiFunctions.openPatientSessionWindow = openPatientSessionWindow;
    window.uiFunctions.closePatientSessionWindow = closePatientSessionWindow;
    window.uiFunctions.initializeSessionSteps = initializeSessionSteps;
    window.uiFunctions.showPatientProfile = showPatientProfile;
    window.uiFunctions.hidePatientProfile = hidePatientProfile;
    window.uiFunctions.showSessionPlanningPanel = showSessionPlanningPanel;
    window.uiFunctions.hideSessionPlanningPanel = hideSessionPlanningPanel;
    window.uiFunctions.showSessionPreparationPanel = showSessionPreparationPanel;
    window.uiFunctions.hideSessionPreparationPanel = hideSessionPreparationPanel;
    window.uiFunctions.showSessionRecordingPanel = showSessionRecordingPanel;
    window.uiFunctions.hideSessionRecordingPanel = hideSessionRecordingPanel;
    window.uiFunctions.showSessionAnalysisPanel = showSessionAnalysisPanel;
    window.uiFunctions.hideSessionAnalysisPanel = hideSessionAnalysisPanel;
    window.uiFunctions.updateStep1Name = updateStep1Name;
    window.uiFunctions.updateAllStepNames = updateAllStepNames;
    window.uiFunctions.updateCurrentStepDetails = updateCurrentStepDetails;
    window.uiFunctions.nextStep = nextStep;
    window.uiFunctions.previousStep = previousStep;
    window.uiFunctions.updateNavigationButtons = updateNavigationButtons;
    window.uiFunctions.completeSession = completeSession;
    window.uiFunctions.cancelSession = cancelSession;
    window.uiFunctions.viewSession = viewSession;
    window.uiFunctions.deleteSession = deleteSession;
    window.uiFunctions.exportCurrentSession = exportCurrentSession;
    window.uiFunctions.exportSessions = exportSessions;
    window.uiFunctions.startLiveSession = startLiveSession;
    window.uiFunctions.stopLiveSession = stopLiveSession;
    window.uiFunctions.jumpToAnalysis = jumpToAnalysis;
})();
