/**
 * UI Utils - Utility functions
 */
(function() {
    'use strict';

    let loadingTimeout;

    function showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (!overlay) return;

        // Force remove any pointer-events blocking styles immediately if we are showing it
        if (show) {
            // Check if it's already active to avoid resetting timeout
            if (!overlay.classList.contains('active')) {
                overlay.classList.add('active');
                overlay.style.display = 'flex'; // Also set inline style for consistency
                overlay.style.pointerEvents = 'auto'; // Allow clicking on overlay when visible
                // Ensure high z-index but not infinite blocking
                overlay.style.zIndex = '9999'; 
            }
            
            // Safety timeout: auto-hide after 8 seconds (reduced from 10)
            clearTimeout(loadingTimeout);
            loadingTimeout = setTimeout(() => {
                if (overlay.classList.contains('active') || overlay.style.display === 'flex') {
                    console.warn('[showLoading] Loading overlay timed out - auto hiding');
                    hideLoadingOverlay(overlay);
                }
            }, 8000);
        } else {
            hideLoadingOverlay(overlay);
            clearTimeout(loadingTimeout);
        }
        
        if (window.uiState) {
            window.uiState.isLoading = show;
        }
    }
    
    // Helper function to properly hide loading overlay
    function hideLoadingOverlay(overlay) {
        if (!overlay) {
            overlay = document.getElementById('loadingOverlay');
        }
        if (!overlay) return;
        
        overlay.classList.remove('active');
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none'; // Ensure overlay doesn't block when hidden
        
        // Force reset pointer events on interactive elements
        document.body.style.pointerEvents = 'auto';
        
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.pointerEvents = 'auto';
        }
        
        const app = document.getElementById('app');
        if (app) {
            app.style.pointerEvents = 'auto';
        }
        
        if (window.uiState) {
            window.uiState.isLoading = false;
        }
    }

    function showSkeletonLoading(containerId, type = 'card') {
        const container = document.getElementById(containerId);
        if (!container) return;
    
        let skeletonHTML = '';
        
        switch (type) {
            case 'card':
                skeletonHTML = `
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-text long"></div>
                        <div class="skeleton skeleton-text medium"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                `;
                break;
            case 'table':
                skeletonHTML = `
                    <div class="skeleton-table-row skeleton"></div>
                    <div class="skeleton-table-row skeleton"></div>
                    <div class="skeleton-table-row skeleton"></div>
                `;
                break;
            case 'patient-card':
                skeletonHTML = `
                    <div class="patient-card">
                        <div class="patient-card-header">
                            <div class="skeleton skeleton-avatar"></div>
                            <div class="patient-info">
                                <div class="skeleton skeleton-text medium"></div>
                                <div class="skeleton skeleton-text short"></div>
                            </div>
                        </div>
                        <div class="skeleton skeleton-text long"></div>
                    </div>
                `;
                break;
            case 'stat-card':
                skeletonHTML = `
                    <div class="stat-card">
                        <div class="skeleton skeleton-avatar"></div>
                        <div class="stat-content">
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-text medium"></div>
                        </div>
                    </div>
                `;
                break;
        }
        
        container.innerHTML = skeletonHTML;
    }

    function showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-message">${message}</div>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
        
        console.log(`Notification (${type}): ${message}`);
    }

    function formatDate(dateString, includeTime = true) {
        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        
        return date.toLocaleDateString('en-US', options);
    }

    function calculateAge(birthDateString) {
        const birthDate = new Date(birthDateString);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age;
    }

    function handleKeyboardNavigation(event) {
        // Only handle navigation if no input is focused
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
            return;
        }
    
        // Handle navigation shortcuts
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case '1':
                    event.preventDefault();
                    window.ui.switchView('dashboard');
                    break;
                case '2':
                    event.preventDefault();
                    window.ui.switchView('live-session');
                    break;
                case '3':
                    event.preventDefault();
                    window.ui.switchView('dashboard');
                    break;
                case '4':
                    event.preventDefault();
                    window.ui.switchView('sessions');
                    break;
                case '5':
                    event.preventDefault();
                    window.ui.switchView('reports');
                    break;
                case ',':
                    event.preventDefault();
                    window.ui.switchView('settings');
                    break;
                case 't':
                    event.preventDefault();
                    window.ui.toggleTheme();
                    break;
            }
        }
    
        // Handle arrow key navigation in sidebar
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const navItems = document.querySelectorAll('.nav-item');
            const currentActive = document.querySelector('.nav-item.active');
            const currentIndex = Array.from(navItems).indexOf(currentActive);
            
            if (currentIndex !== -1) {
                event.preventDefault();
                let nextIndex;
                
                if (event.key === 'ArrowDown') {
                    nextIndex = (currentIndex + 1) % navItems.length;
                } else {
                    nextIndex = (currentIndex - 1 + navItems.length) % navItems.length;
                }
                
                const nextItem = navItems[nextIndex];
                if (nextItem) {
                    nextItem.click();
                    nextItem.focus();
                }
            }
        }
    }

    async function handleLogout() {
        try {
            // Show confirmation dialog
            const confirmed = confirm('Are you sure you want to logout?');
            if (!confirmed) {
                return;
            }
    
            // Show loading
            window.ui.showLoading(true);
    
            // Clear authentication
            if (window.authManager) {
                window.authManager.logout();
            }
    
            // Clear API token
            if (window.api) {
                window.api.clearAuthToken();
            }
    
            // Show login screen
            if (window.authManager) {
                window.authManager.showLoginScreen();
            }
    
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    /**
     * Debug function to diagnose UI freeze issues
     * Can be called from DevTools console: window.debugUIState()
     */
    function debugUIState() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const mainContent = document.getElementById('mainContent');
        const activeModals = document.querySelectorAll('.modal.active');
        
        const state = {
            timestamp: new Date().toISOString(),
            uiState: window.uiState ? { ...window.uiState } : 'undefined',
            overlays: {
                loading: loadingOverlay ? {
                    display: window.getComputedStyle(loadingOverlay).display,
                    visibility: window.getComputedStyle(loadingOverlay).visibility,
                    pointerEvents: window.getComputedStyle(loadingOverlay).pointerEvents,
                    hasActiveClass: loadingOverlay.classList.contains('active')
                } : 'not found',
                login: loginScreen ? {
                    display: window.getComputedStyle(loginScreen).display
                } : 'not found'
            },
            containers: {
                body: {
                    pointerEvents: window.getComputedStyle(document.body).pointerEvents
                },
                app: app ? {
                    display: window.getComputedStyle(app).display,
                    pointerEvents: window.getComputedStyle(app).pointerEvents
                } : 'not found',
                mainContent: mainContent ? {
                    pointerEvents: window.getComputedStyle(mainContent).pointerEvents
                } : 'not found'
            },
            activeModals: Array.from(activeModals).map(m => m.id),
            documentHasFocus: document.hasFocus(),
            activeElement: document.activeElement ? {
                tag: document.activeElement.tagName,
                id: document.activeElement.id,
                class: document.activeElement.className
            } : 'none'
        };
        
        console.log('[UI Debug State]', state);
        return state;
    }
    
    /**
     * Force reset all UI blocking states - AGGRESSIVE VERSION
     * Can be called from DevTools console: window.forceResetUI()
     * Pass true to also close modals: window.forceResetUI(true)
     * 
     * EMERGENCY KEYBOARD SHORTCUT: Ctrl+Alt+Shift+R
     */
    function forceResetUI(closeModals = false) {
        console.log('[forceResetUI] AGGRESSIVE UI reset starting...');
        
        // 1. Hide loading overlay - AGGRESSIVE
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.pointerEvents = 'none';
            loadingOverlay.style.visibility = 'hidden';
            loadingOverlay.style.zIndex = '-1';
        }
        
        // 2. Reset ALL pointer-events - AGGRESSIVE
        document.body.style.pointerEvents = 'auto';
        document.body.style.removeProperty('pointer-events');
        
        const app = document.getElementById('app');
        if (app) {
            app.style.pointerEvents = 'auto';
            app.style.removeProperty('pointer-events');
        }
        
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.pointerEvents = 'auto';
            mainContent.style.removeProperty('pointer-events');
        }
        
        // 3. Reset ALL inputs - AGGRESSIVE
        document.querySelectorAll('input, textarea, select').forEach(el => {
            if (!el.disabled) {
                el.style.pointerEvents = 'auto';
                el.style.removeProperty('pointer-events');
                el.removeAttribute('readonly');
                if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') === '-1') {
                    el.removeAttribute('tabindex');
                }
            }
        });
        
        // 4. Reset toggles and checkboxes
        document.querySelectorAll('[type="checkbox"], [type="radio"], [role="switch"], [role="checkbox"]').forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.removeProperty('pointer-events');
        });
        
        // 5. Only close modals if explicitly requested
        if (closeModals) {
            console.log('[forceResetUI] Closing all modals...');
            document.querySelectorAll('.modal.active, .modal-enhanced.active').forEach(modal => {
                modal.classList.remove('active');
            });
            if (window.uiState) {
                window.uiState.currentModal = null;
            }
        }
        
        // 6. Reset uiState
        if (window.uiState) {
            window.uiState.isLoading = false;
        }
        
        // 7. Force reflow
        void document.body.offsetHeight;
        
        // 8. Call global fix if available
        if (typeof window.fixInputFreeze === 'function') {
            window.fixInputFreeze();
        }
        
        console.log('[forceResetUI] AGGRESSIVE reset complete');
        return true;
    }
    
    // Emergency keyboard shortcut: Ctrl+Alt+Shift+R
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Emergency] Emergency UI reset triggered by Ctrl+Alt+Shift+R');
            forceResetUI(false); // Don't close modals automatically
            // Show visual feedback
            const notification = document.createElement('div');
            notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 24px;border-radius:8px;z-index:99999;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
            notification.textContent = '✓ UI Reset Complete';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
    }, true);

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.showLoading = showLoading;
    window.uiFunctions.hideLoadingOverlay = hideLoadingOverlay;
    window.uiFunctions.showSkeletonLoading = showSkeletonLoading;
    window.uiFunctions.showNotification = showNotification;
    window.uiFunctions.formatDate = formatDate;
    window.uiFunctions.calculateAge = calculateAge;
    window.uiFunctions.handleKeyboardNavigation = handleKeyboardNavigation;
    
    // Expose debug functions globally for console access
    window.debugUIState = debugUIState;
    window.forceResetUI = forceResetUI;
    window.uiFunctions.handleLogout = handleLogout;
})();