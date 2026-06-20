/**
 * Input Protection Module
 * Prevents and fixes input freeze issues aggressively
 */
(function() {
    'use strict';
    
    // Global input protection - ensures inputs are always accessible
    function protectInputs() {
        // Remove any inline styles that block inputs
        document.querySelectorAll('input:not([disabled]), textarea:not([disabled]), select:not([disabled])').forEach(input => {
            const computed = window.getComputedStyle(input);
            
            // If pointer-events is none, force it to auto
            if (computed.pointerEvents === 'none') {
                input.style.pointerEvents = 'auto';
            }
            
            // Remove readonly if it was added dynamically
            if (input.hasAttribute('readonly') && !input.hasAttribute('data-readonly-permanent')) {
                input.removeAttribute('readonly');
            }
            
            // Ensure tabindex allows focus
            if (input.hasAttribute('tabindex') && input.getAttribute('tabindex') === '-1') {
                input.removeAttribute('tabindex');
            }
        });
    }
    
    // Run protection on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', protectInputs);
    } else {
        protectInputs();
    }
    
    // Protect inputs before any input event
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
            // Ensure the element can receive focus
            target.style.pointerEvents = 'auto';
            target.removeAttribute('readonly');
            if (target.hasAttribute('tabindex') && target.getAttribute('tabindex') === '-1') {
                target.removeAttribute('tabindex');
            }
        }
    }, true);
    
    // Protect inputs on click - especially in modals
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.type === 'checkbox' ||
            target.type === 'radio' ||
            target.closest('input, textarea, select, [role="checkbox"], [role="switch"]')
        )) {
            // Immediately ensure it's accessible
            const element = target.closest('input, textarea, select') || target;
            if (element) {
                element.style.pointerEvents = 'auto';
                element.style.removeProperty('pointer-events');
                
                // If inside a modal, ensure modal content is also accessible
                const modal = element.closest('.modal, .modal-enhanced');
                if (modal && modal.classList.contains('active')) {
                    const modalContent = modal.querySelector('.modal-content, .modal-content-enhanced');
                    if (modalContent) {
                        modalContent.style.pointerEvents = 'auto';
                    }
                    modal.style.pointerEvents = 'auto';
                }
            }
        }
    }, true);
    
    // Monitor for stuck overlays and window focus issues
    let lastCheck = Date.now();
    let lastInputAttempt = 0;
    let consecutiveInputFailures = 0;
    let windowFocusState = { focused: true, visible: true };
    
    // Track window focus state from main process
    if (window.electronAPI) {
        window.electronAPI.onWindowFocused(() => {
            windowFocusState.focused = true;
            consecutiveInputFailures = 0; // Reset on focus
        });
        
        window.electronAPI.onWindowBlurred(() => {
            windowFocusState.focused = false;
        });
        
        // Periodically check window focus state
        setInterval(async () => {
            if (window.electronAPI && window.electronAPI.getWindowFocusState) {
                try {
                    const state = await window.electronAPI.getWindowFocusState();
                    windowFocusState = state;
                } catch (e) {
                    console.warn('[InputProtection] Could not get window focus state:', e);
                }
            }
        }, 5000);
    }
    
    // Track input attempts
    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.type === 'checkbox' ||
            target.type === 'radio' ||
            target.closest('input, textarea, select, [role="checkbox"], [role="switch"]')
        )) {
            lastInputAttempt = Date.now();
        }
    }, true);
    
    setInterval(() => {
        const now = Date.now();
        if (now - lastCheck > 3000) { // Check every 3 seconds
            lastCheck = now;
            
            // Check loading overlay
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                const style = window.getComputedStyle(loadingOverlay);
                if (style.display !== 'none' && window.uiState && !window.uiState.isLoading) {
                    console.warn('[InputProtection] Stuck loading overlay detected - fixing');
                    loadingOverlay.classList.remove('active');
                    loadingOverlay.style.display = 'none';
                    loadingOverlay.style.pointerEvents = 'none';
                }
            }
            
            // Check body pointer-events
            const bodyPE = window.getComputedStyle(document.body).pointerEvents;
            if (bodyPE === 'none' && !document.querySelector('.modal.active')) {
                console.warn('[InputProtection] Body pointer-events blocked - fixing');
                document.body.style.pointerEvents = 'auto';
            }
            
            // Check for window focus issues
            // If user recently tried to interact but window isn't focused, recover focus
            const timeSinceInputAttempt = now - lastInputAttempt;
            if (timeSinceInputAttempt < 5000 && !windowFocusState.focused && windowFocusState.visible && !windowFocusState.minimized) {
                consecutiveInputFailures++;
                console.warn(`[InputProtection] Window focus issue detected (failures: ${consecutiveInputFailures}) - attempting recovery`);
                
                if (consecutiveInputFailures >= 2 && window.electronAPI && window.electronAPI.recoverWindowFocus) {
                    window.electronAPI.recoverWindowFocus().then(result => {
                        if (result && result.success) {
                            console.log('[InputProtection] Window focus recovered successfully');
                            consecutiveInputFailures = 0;
                        }
                    }).catch(e => {
                        console.warn('[InputProtection] Failed to recover window focus:', e);
                    });
                }
            } else if (windowFocusState.focused) {
                consecutiveInputFailures = 0; // Reset on successful focus
            }
            
            // Protect inputs
            protectInputs();
            
            // Special protection for modal inputs
            const activeModal = document.querySelector('.modal.active, .modal-enhanced.active');
            if (activeModal) {
                const modalContent = activeModal.querySelector('.modal-content, .modal-content-enhanced');
                if (modalContent) {
                    // Ensure modal content can receive events
                    modalContent.style.pointerEvents = 'auto';
                    
                    // Protect all inputs in modal
                    modalContent.querySelectorAll('input:not([disabled]), textarea:not([disabled]), select:not([disabled])').forEach(input => {
                        input.style.pointerEvents = 'auto';
                        input.style.removeProperty('pointer-events');
                    });
                }
            }
        }
    }, 3000);
    
    // Expose global fix function
    window.fixInputFreeze = function() {
        console.log('[InputProtection] Manual fix triggered');
        
        // Hide loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.pointerEvents = 'none';
        }
        
        // Reset pointer-events
        document.body.style.pointerEvents = 'auto';
        const app = document.getElementById('app');
        if (app) app.style.pointerEvents = 'auto';
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.style.pointerEvents = 'auto';
        
        // Fix all inputs
        protectInputs();
        
        // Reset uiState
        if (window.uiState) {
            window.uiState.isLoading = false;
        }
        
        // Attempt to recover window focus if available
        if (window.electronAPI && window.electronAPI.recoverWindowFocus) {
            window.electronAPI.recoverWindowFocus().catch(e => {
                console.warn('[InputProtection] Could not recover window focus:', e);
            });
        }
        
        // Reset focus failure counter
        consecutiveInputFailures = 0;
        
        console.log('[InputProtection] Fix complete');
    };
    
    console.log('[InputProtection] Input protection module loaded');
})();


