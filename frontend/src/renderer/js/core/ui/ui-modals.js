/**
 * UI Modals - Modal management
 */
(function() {
    'use strict';

    // Store previously focused element for restoration
    let previousActiveElement = null;
    // Store focus trap handler
    let focusTrapHandler = null;

    /**
     * Focus trap - keeps focus within modal
     */
    function createFocusTrap(modal) {
        // Remove existing trap
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
        }

        const modalContent = modal.querySelector('.modal-content, .modal-content-enhanced');
        if (!modalContent) return;

        // Get all focusable elements within modal
        const getFocusableElements = () => {
            const focusableSelectors = [
                'input:not([disabled]):not([type="hidden"])',
                'textarea:not([disabled])',
                'select:not([disabled])',
                'button:not([disabled])',
                'a[href]',
                '[tabindex]:not([tabindex="-1"])',
                '[contenteditable="true"]'
            ].join(', ');
            
            return Array.from(modalContent.querySelectorAll(focusableSelectors))
                .filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0';
                });
        };

        focusTrapHandler = (e) => {
            // Only trap if Tab is pressed
            if (e.key !== 'Tab') return;

            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            // If Shift+Tab on first element, move to last
            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
            // If Tab on last element, move to first
            else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', focusTrapHandler, true);
    }

    /**
     * Remove focus trap
     */
    function removeFocusTrap() {
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
            focusTrapHandler = null;
        }
    }

    /**
     * Set initial focus on first input in modal
     */
    function setInitialFocus(modal) {
        // Use requestAnimationFrame to ensure modal is rendered
        requestAnimationFrame(() => {
            const modalContent = modal.querySelector('.modal-content, .modal-content-enhanced');
            if (!modalContent) return;

            // Find first focusable input
            const firstInput = modalContent.querySelector(
                'input:not([disabled]):not([type="hidden"]), ' +
                'textarea:not([disabled]), ' +
                'select:not([disabled]), ' +
                'button:not([disabled]), ' +
                '[tabindex]:not([tabindex="-1"])'
            );

            if (firstInput) {
                try {
                    firstInput.focus();
                    // If it's a text input, select the text if any
                    if (firstInput.tagName === 'INPUT' && firstInput.type === 'text') {
                        firstInput.select();
                    }
                } catch (e) {
                    console.warn('[Modal] Could not focus first input:', e);
                }
            }

            // Ensure modal content has proper pointer-events
            modalContent.style.pointerEvents = 'auto';
            modalContent.style.userSelect = 'auto';
        });
    }

    function openModal(modalIdOrHTML, modalId = null) {
        // Save current focus
        previousActiveElement = document.activeElement;

        // If first arg is HTML string, create modal dynamically
        if (typeof modalIdOrHTML === 'string' && modalIdOrHTML.trim().startsWith('<')) {
            const id = modalId || 'dynamicModal';
            let modal = document.getElementById(id);
            
            // Remove existing if present
            if (modal) {
                modal.remove();
            }
            
            // Create new modal
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = id;
            modal.innerHTML = modalIdOrHTML;
            document.body.appendChild(modal);
            
            // Show it
            modal.classList.add('active');
            window.uiState.currentModal = id;

            // Setup focus management
            createFocusTrap(modal);
            setInitialFocus(modal);

            // Ensure modal overlay doesn't block clicks on modal content
            modal.style.pointerEvents = 'auto';
            
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        } else {
            // Regular modal ID lookup
            const modal = document.getElementById(modalIdOrHTML);
            if (modal) {
                modal.classList.add('active');
                window.uiState.currentModal = modalIdOrHTML;

                // Setup focus management
                createFocusTrap(modal);
                setInitialFocus(modal);

                // Ensure modal overlay doesn't block clicks on modal content
                modal.style.pointerEvents = 'auto';

                // Prevent body scroll when modal is open
                document.body.style.overflow = 'hidden';
            } else {
                console.error(`Modal with ID "${modalIdOrHTML}" not found`);
            }
        }

        // Ensure window has focus
        if (window.electronAPI && window.electronAPI.recoverWindowFocus) {
            window.electronAPI.recoverWindowFocus().catch(() => {
                // Ignore errors
            });
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            
            // Remove focus trap
            removeFocusTrap();

            // Restore body scroll
            document.body.style.overflow = '';

            // Restore previous focus
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                try {
                    previousActiveElement.focus();
                } catch (e) {
                    // Element might not be focusable anymore
                    console.warn('[Modal] Could not restore focus:', e);
                }
            }
            previousActiveElement = null;

            // If it's a dynamic modal, remove it after a short delay
            if (modalId === 'protocolModal' || modalId === 'dynamicModal' || modalId === 'customBandModal' || modalId === 'confirmDeleteModal') {
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.remove();
                    }
                }, 300);
            }
        }
        window.uiState.currentModal = null;
        window.uiState.currentEditId = null;
        if (window.ui.resetForms) {
            window.ui.resetForms();
        }

        // Ensure inputs are still accessible after modal closes
        if (window.fixInputFreeze) {
            setTimeout(() => {
                window.fixInputFreeze();
            }, 100);
        }
    }

    function openUserModal(user = null) {
        if (user) {
            // Edit mode
            window.uiState.currentEditId = user.id;
            document.getElementById('userModalTitle').textContent = 'Edit Doctor';
            document.getElementById('userFirstName').value = user.first_name;
            document.getElementById('userLastName').value = user.last_name;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userPassword').style.display = 'none';
        } else {
            // Add mode
            document.getElementById('userModalTitle').textContent = 'Add Doctor';
            document.getElementById('userPassword').style.display = 'block';
        }
        
        window.ui.openModal('userModal');
    }

    async function openPatientModal(patient = null) {
        try {
            if (patient) {
                // Edit mode
                window.uiState.currentEditId = patient.id;
                document.getElementById('patientModalTitle').textContent = 'Edit Patient';
                document.getElementById('patientFirstName').value = patient.first_name;
                document.getElementById('patientLastName').value = patient.last_name;
                document.getElementById('patientPhone').value = patient.phone_number || '';
                document.getElementById('patientDateOfBirth').value = patient.date_of_birth;
                document.getElementById('patientGender').value = patient.gender !== null ? patient.gender.toString() : '';
            } else {
                // Add mode
                document.getElementById('patientModalTitle').textContent = 'Add Patient';
            }
        } catch (error) {
            
        }
        
        window.ui.openModal('patientModal');
    }

    async function openSessionModal() {
        try {
            // Load patients for dropdown
            const patients = await window.api.getAllPatients();
            const patientSelect = document.getElementById('modalSessionPatientSelect');
            patientSelect.innerHTML = '<option value="">Select a patient...</option>';
            
            patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.id;
                option.textContent = `${patient.first_name} ${patient.last_name}`;
                patientSelect.appendChild(option);
            });
    
            // Initialize channel selector for session modal
            window.ui.renderSessionChannelSelector();
            
        } catch (error) {
            
        }
        
        window.ui.openModal('sessionModal');
    }

    function openProtocolModal() {
        const patientId = document.getElementById('sessionPatientSelect').value;
        if (!patientId) {
            
            return;
        }
        window.ui.openModal('protocolModal');
    }

    function showSessionDetailModal(session, patient) {
        const modalBody = document.getElementById('sessionDetailBody');
        const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
        const duration = session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 'N/A';
        const successRate = session.overall_success_rate ? (session.overall_success_rate * 100).toFixed(1) : 'N/A';
        
        modalBody.innerHTML = `
            <div class="session-detail-grid">
                <div class="detail-section">
                    <h4>Patient Information</h4>
                    <div class="detail-row">
                        <span class="detail-label">Patient:</span>
                        <span class="detail-value">${patientName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Session ID:</span>
                        <span class="detail-value">#${session.id}</span>
                    </div>
                </div>
    
                <div class="detail-section">
                    <h4>Session Details</h4>
                    <div class="detail-row">
                        <span class="detail-label">Protocol:</span>
                        <span class="detail-value">${session.protocol_type}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Channels:</span>
                        <span class="detail-value">${session.channels}</span>
                    </div>
                </div>
    
                <div class="detail-section">
                    <h4>Timing</h4>
                    <div class="detail-row">
                        <span class="detail-label">Start Time:</span>
                        <span class="detail-value">${window.ui.formatDate(session.start_time)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">End Time:</span>
                        <span class="detail-value">${session.end_time ? window.ui.formatDate(session.end_time) : 'Ongoing'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${duration} minutes</span>
                    </div>
                </div>
    
                <div class="detail-section">
                    <h4>Performance Metrics</h4>
                    <div class="detail-row">
                        <span class="detail-label">Success Rate:</span>
                        <span class="detail-value">${successRate}%</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Reward Time:</span>
                        <span class="detail-value">${session.total_reward_time_seconds || 'N/A'} seconds</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Artifact Time:</span>
                        <span class="detail-value">${session.total_artifact_time_seconds || 'N/A'} seconds</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Avg Impedance:</span>
                        <span class="detail-value">${session.average_impedance ? session.average_impedance.toFixed(2) : 'N/A'} kΩ</span>
                    </div>
                </div>
    
                <div class="detail-section full-width">
                    <h4>Configuration</h4>
                    <div class="detail-row">
                        <span class="detail-label">Sample Rate:</span>
                        <span class="detail-value">${session.sample_rate} Hz</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Rounds:</span>
                        <span class="detail-value">${session.session_rounds}</span>
                    </div>
                    <div class="detail-row">
                    </div>
                </div>
    
                ${session.doctor_notes ? `
                <div class="detail-section full-width">
                    <h4>Doctor Notes</h4>
                    <p class="detail-notes">${session.doctor_notes}</p>
                </div>
                ` : ''}
            </div>
        `;
        
        window.ui.openModal('sessionDetailModal');
    }

    function showAboutDialog() {
        
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.openModal = openModal;
    window.uiFunctions.closeModal = closeModal;
    window.uiFunctions.openUserModal = openUserModal;
    window.uiFunctions.openPatientModal = openPatientModal;
    window.uiFunctions.openSessionModal = openSessionModal;
    window.uiFunctions.openProtocolModal = openProtocolModal;
    window.uiFunctions.showSessionDetailModal = showSessionDetailModal;
    window.uiFunctions.showAboutDialog = showAboutDialog;
})();
