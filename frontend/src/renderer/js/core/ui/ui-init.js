/**
 * UI Initialization - Event listeners and setup
 */
(function() {
    'use strict';

    // Reset any stuck overlays or blocked states
    function resetBlockedStates() {
        console.log('[UI-Init] Resetting blocked states...');
        
        // Reset loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.pointerEvents = 'none'; // Overlay should never block when hidden
        }
        
        // Reset body pointer events
        document.body.style.pointerEvents = 'auto';
        
        // Reset main content pointer events
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.pointerEvents = 'auto';
        }
        
        // Reset app container pointer events
        const app = document.getElementById('app');
        if (app) {
            app.style.pointerEvents = 'auto';
        }
        
        // Ensure all inputs are interactive
        document.querySelectorAll('input, textarea, select').forEach(el => {
            if (!el.disabled) {
                el.style.pointerEvents = 'auto';
            }
        });
        
        // NOTE: Do NOT auto-close modals - they may be legitimately open by different features
        // (e.g., blockModal, protocolModal, etc.) that don't update uiState.currentModal
        
        console.log('[UI-Init] Blocked states reset complete');
    }
    
    // Add keyboard shortcut to force reset (Ctrl/Cmd + Shift + R)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            console.log('[UI-Init] Force reset triggered by keyboard shortcut');
            resetBlockedStates();
        }
    });

    function initialize() {
        const initFn = () => {
            // First, reset any stuck states from previous sessions
            resetBlockedStates();
            
            const fns = window.uiFunctions || window.ui || {};
            fns.initializeEventListeners?.();
            fns.loadStoredSettings?.();
            fns.renderChannelSelector?.();
            fns.initPatientsTableControls?.();
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFn);
        } else {
            setTimeout(initFn, 0);
        }
    }

    function initializeEventListeners() {
        const fns = window.uiFunctions || window.ui || {};
        fns.initializeNavigation?.();
        fns.initializeButtons?.();
        fns.initializeModals?.();
        fns.initializeForms?.();
        fns.initializeElectronMenu?.();
    }

    function initializeNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const viewName = item.dataset.view;
                if (viewName) {
                    window.ui.switchView(viewName);
                }
            });
        });
    }

    function initializeButtons() {
        // Quick Actions from Dashboard
        document.getElementById('quickStartSession')?.addEventListener('click', () => {
            window.ui.switchView('live-session');
        });
    
        document.getElementById('quickManagePatients')?.addEventListener('click', () => {
            window.ui.switchView('dashboard');
        });
    
        document.getElementById('quickViewSessions')?.addEventListener('click', () => {
            window.ui.switchView('sessions');
        });

        // Add Protocol button
        document.getElementById('addProtocolBtn')?.addEventListener('click', () => {
            window.ui.openProtocolModal();
        });
    
        // Toggle patients table visibility
        document.getElementById('togglePatientsTable')?.addEventListener('click', () => {
            const container = document.getElementById('patientsTableContainer');
            const toggleBtn = document.getElementById('togglePatientsTable');
            const toggleLabel = toggleBtn?.querySelector('.toggle-label');
            const toggleIcon = toggleBtn?.querySelector('.toggle-icon');
            
            if (container && toggleBtn) {
                const isHidden = container.style.display === 'none';
                
                if (isHidden) {
                    container.style.display = 'block';
                    // Remove any previous animation classes
                    container.classList.remove('animated-out');
                    // Trigger fade-in animation
                    requestAnimationFrame(() => {
                        container.classList.add('animated-in');
                    });
                } else {
                    // Remove fade-in class, add fade-out class
                    container.classList.remove('animated-in');
                    container.classList.add('animated-out');
                    // Hide after animation completes
                    setTimeout(() => {
                        container.style.display = 'none';
                        container.classList.remove('animated-out');
                    }, 300);
                }
                
                if (toggleLabel) {
                    toggleLabel.textContent = isHidden ? 'Hide' : 'View All';
                }
                
                if (toggleIcon) {
                    toggleIcon.setAttribute('data-lucide', isHidden ? 'chevron-up' : 'chevron-down');
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }
                
                // Load data if showing for the first time
                if (isHidden && container.querySelector('tbody tr.empty-state')) {
                    window.ui.loadPatientsData();
                }
            }
        });
    
        document.getElementById('dashboardAddPatient')?.addEventListener('click', () => {
            window.ui.openPatientModal();
        });

        document.getElementById('dashboardNewPatientBtn')?.addEventListener('click', () => {
            window.ui.openPatientModal();
        });
    
    
        // Sessions
        document.getElementById('addSessionBtn')?.addEventListener('click', () => {
            window.ui.openSessionModal();
        });
    
        document.getElementById('exportSessionsBtn')?.addEventListener('click', () => {
            window.ui.exportSessions();
        });
    
        // Live Session
        document.getElementById('startSessionBtn')?.addEventListener('click', () => {
            window.ui.startLiveSession();
        });
    
        document.getElementById('stopSessionBtn')?.addEventListener('click', () => {
            window.ui.stopLiveSession();
        });
    
        // Settings
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => {
            window.ui.testConnection();
        });
    
        // Session Process Window
        document.getElementById('sessionProcessClose')?.addEventListener('click', () => {
            window.ui.closePatientSessionWindow();
			window.ui.cancelSession();
        });
    
        document.getElementById('nextSessionStepBtn')?.addEventListener('click', async () => {
            // nextStep() already handles saving patient profile at step 1 and treatment plan at step 2
            await window.ui.nextStep();
        });
    
        document.getElementById('prevSessionStepBtn')?.addEventListener('click', async () => {
            await window.ui.previousStep();
        });
    
        document.getElementById('cancelSessionProcessBtn')?.addEventListener('click', () => {
            window.ui.cancelSession();
        });
    
        // Logout Button
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            window.ui.handleLogout();
        });
    
    
        // Theme Toggle
        document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
            window.ui.toggleTheme();
        });
    
        // Session filters
        const filters = ['sessionFilterPatient', 'sessionFilterProtocol', 'sessionFilterStartDate', 'sessionFilterEndDate'];
        filters.forEach(filterId => {
            const elem = document.getElementById(filterId);
            if (elem) {
                elem.addEventListener('change', () => {
                window.ui.filterSessions();
            });
            }
        });
    
        // Session Detail Modal
        document.getElementById('sessionDetailModalClose')?.addEventListener('click', () => {
            window.ui.closeModal('sessionDetailModal');
        });
    
        document.getElementById('sessionDetailCloseBtn')?.addEventListener('click', () => {
            window.ui.closeModal('sessionDetailModal');
        });
    
        document.getElementById('exportSessionBtn')?.addEventListener('click', () => {
            window.ui.exportCurrentSession();
        });
    
        // Create User Button
        document.getElementById('createUserBtn')?.addEventListener('click', () => {
            window.ui.createDefaultUser();
        });
    
        // Session Management Buttons
    
        document.getElementById('refreshSessionsBtn')?.addEventListener('click', () => {
            window.ui.loadSessionsData();
        });
    
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
            window.ui.clearSessionFilters();
        });
    
        document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
            window.ui.filterSessions();
        });
    
        // Session Modal
        document.getElementById('sessionModalClose')?.addEventListener('click', () => {
            window.ui.closeModal('sessionModal');
        });
    
        document.getElementById('sessionCancelBtn')?.addEventListener('click', () => {
            window.ui.closeModal('sessionModal');
        });
    
        // Session Form
        document.getElementById('sessionForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            window.ui.handleSessionFormSubmit();
        });
    
        // Search input
        document.getElementById('sessionSearchInput')?.addEventListener('input', () => {
            window.ui.debounceSearch();
        });
    
        // Theme selector
        document.getElementById('themeSelect')?.addEventListener('change', (e) => {
            window.ui.applyTheme(e.target.value);
        });
    
        // Auto-sync checkbox
        document.getElementById('autoSyncCheck')?.addEventListener('change', (e) => {
            localStorage.setItem('autoSync', e.target.checked);
        });
    
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            window.ui.handleKeyboardNavigation(e);
        });
    }

    function initializeModals() {
        // User Modal
        const userModal = document.getElementById('userModal');
        const userModalClose = document.getElementById('userModalClose');
        const userCancelBtn = document.getElementById('userCancelBtn');
        
        [userModalClose, userCancelBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                window.ui.closeModal('userModal');
            });
        });
    
        // Patient Modal
        const patientModal = document.getElementById('patientModal');
        const patientModalClose = document.getElementById('patientModalClose');
        const patientCancelBtn = document.getElementById('patientCancelBtn');
        
        [patientModalClose, patientCancelBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                window.ui.closeModal('patientModal');
            });
        });
    
        // Close modals when clicking outside - but NOT if clicking on inputs
        window.addEventListener('click', (e) => {
            const target = e.target;
            // Don't close modals if clicking on interactive elements
            const isInteractive = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.tagName === 'BUTTON' ||
                target.isContentEditable ||
                target.closest('input, textarea, select, button, [contenteditable], .modal-content, .modal-content-enhanced')
            );
            
            // Only close modal if clicking directly on the modal overlay, not on modal content
            if (!isInteractive && target.classList.contains('modal') && !target.closest('.modal-content, .modal-content-enhanced')) {
                window.ui.closeModal(target.id);
            }
        });
    }

    function initializeForms() {
        // User Form
        document.getElementById('userForm').addEventListener('submit', (e) => {
            e.preventDefault();
            window.ui.handleUserFormSubmit();
        });
    
        // Patient Form
        document.getElementById('patientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            window.ui.handlePatientFormSubmit();
        });
    
        // Patient selection for protocol loading
        document.getElementById('sessionPatientSelect').addEventListener('change', (e) => {
            const patientId = e.target.value;
            if (patientId) {
                window.ui.loadProtocolsForPatient(parseInt(patientId));
            } else {
                const protocolSelect = document.getElementById('protocolTypeSelect');
                protocolSelect.innerHTML = '<option value="">Select a patient first...</option>';
            }
        });
    
        // New Protocol button
        document.getElementById('newProtocolBtn').addEventListener('click', () => {
            window.ui.openProtocolModal();
        });
    
        // Protocol form
        document.getElementById('protocolForm').addEventListener('submit', (e) => {
            e.preventDefault();
            window.ui.handleProtocolFormSubmit();
        });
    
        // Protocol modal close buttons
        document.getElementById('protocolModalClose').addEventListener('click', () => {
            window.ui.closeModal('protocolModal');
        });
        document.getElementById('protocolCancelBtn').addEventListener('click', () => {
            window.ui.closeModal('protocolModal');
        });
    
        // Frequency band checkbox toggles
        document.getElementById('alphaEnabled').addEventListener('change', (e) => {
            document.getElementById('alphaInputs').style.display = e.target.checked ? 'flex' : 'none';
        });
        document.getElementById('betaEnabled').addEventListener('change', (e) => {
            document.getElementById('betaInputs').style.display = e.target.checked ? 'flex' : 'none';
        });
        document.getElementById('thetaEnabled').addEventListener('change', (e) => {
            document.getElementById('thetaInputs').style.display = e.target.checked ? 'flex' : 'none';
        });
        document.getElementById('deltaEnabled').addEventListener('change', (e) => {
            document.getElementById('deltaInputs').style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    function initializeElectronMenu() {
        if (window.electronAPI) {
            window.electronAPI.onMenuNewSession(() => {
                window.ui.switchView('live-session');
            });
    
            window.electronAPI.onMenuExportData(() => {
                window.ui.exportSessions();
            });
    
            window.electronAPI.onMenuAbout(() => {
                window.ui.showAboutDialog();
            });
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.initialize = initialize;
    window.uiFunctions.initializeEventListeners = initializeEventListeners;
    window.uiFunctions.initializeNavigation = initializeNavigation;
    window.uiFunctions.initializeButtons = initializeButtons;
    window.uiFunctions.initializeModals = initializeModals;
    window.uiFunctions.initializeForms = initializeForms;
    window.uiFunctions.initializeElectronMenu = initializeElectronMenu;
})();
