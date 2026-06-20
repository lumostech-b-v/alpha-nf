/**
 * Main Application Entry Point
 * Coordinates all modules and manages application lifecycle
 */
class NeuroFeedbackApp {
    constructor() {
        this.isInitialized = false;
        this.modules = {};
        this.currentUser = null; // Default user for the application
        this.config = {
            apiUrl: 'http://localhost:8000',
            wsUrl: 'ws://localhost:8000/sp/nfcore_start',
            autoConnect: true,
            autoSync: true,
            theme: 'light'
        };
        
        console.log('Doctor Management Application starting...');
    }

    // ========================================
    // APPLICATION LIFECYCLE
    // ========================================

    async initializeComponents() {
        if (typeof window.initializeComponents === 'function') {
            window.initializeComponents();
        } else {
            setTimeout(() => {
                if (typeof window.initializeComponents === 'function') {
                    window.initializeComponents();
                }
            }, 100);
        }
    }

    async initialize() {
        try {
            // Listen for dynamic backend URL from main process
            if (window.electronAPI) {
                if (window.electronAPI.onBackendUrl) {
                    window.electronAPI.onBackendUrl((url) => {
                        console.log('Received dynamic backend URL:', url);
                        const apiUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                        const wsUrl = apiUrl.replace(/^http/, 'ws') + '/sp/nfcore_start';
                        
                        this.updateConfiguration({
                            apiUrl: apiUrl,
                            wsUrl: wsUrl
                        });
                        
                        // Re-initialize modules/connections if needed
                        if (this.modules.websocket && this.config.autoConnect) {
                            this.modules.websocket.disconnect();
                            this.modules.websocket.connect();
                        }

                        // If app was already initialized (or failed to), try reloading data
                        if (this.isInitialized || window.ui) {
                            this.loadInitialData(); 
                        }
                    });
                }

                if (window.electronAPI.onBackendError) {
                    window.electronAPI.onBackendError((error) => {
                        console.error('Backend Error:', error);
                    });
                }
            }

            await this.initializeComponents();
            this.loadConfiguration();
            await this.initializeModules();
            this.setupGlobalEventHandlers();
            await this.loadInitialData();
            this.setupAutoSync();
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Application initialization failed:', error);
            this.handleInitializationError(error);
            return false;
        }
    }

    loadConfiguration() {
        const storedConfig = {
            apiUrl: localStorage.getItem('apiUrl'),
            wsUrl: localStorage.getItem('wsUrl'),
            autoConnect: localStorage.getItem('autoConnect') !== 'false',
            autoSync: localStorage.getItem('autoSync') !== 'false',
            theme: localStorage.getItem('theme') || 'light'
        };

        if (storedConfig.wsUrl === 'ws://localhost:8000') {
            storedConfig.wsUrl = 'ws://localhost:8000/sp/nfcore_start';
            localStorage.setItem('wsUrl', storedConfig.wsUrl);
        }

        Object.keys(storedConfig).forEach(key => {
            if (storedConfig[key] !== null && storedConfig[key] !== undefined) {
                this.config[key] = storedConfig[key];
            }
        });

        window.api?.setBaseURL(this.config.apiUrl);
        window.websocket?.setUrl(this.config.wsUrl);
    }

    async initializeModules() {
        this.modules = {
            api: window.api,
            ui: window.ui,
            charts: window.charts,
            websocket: window.websocket
        };

        const missingModules = Object.entries(this.modules)
            .filter(([name, module]) => !module)
            .map(([name]) => name);

        if (missingModules.length > 0) {
            throw new Error(`Missing required modules: ${missingModules.join(', ')}`);
        }

        this.modules.charts?.initializeAllCharts();

        if (this.config.autoConnect && this.modules.websocket) {
            try {
                await this.modules.websocket.connect();
            } catch (error) {
                console.warn('WebSocket auto-connect failed:', error);
            }
        }

        if (window.treatmentPlan) {
            await window.treatmentPlan.refreshAfterAuth();
        }
        if (window.ProgressVisualization) {
            const progressViz = new window.ProgressVisualization();
            await progressViz.loadPatientList();
        }
    }

    setupGlobalEventHandlers() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handlePageHidden();
            } else {
                this.handlePageVisible();
            }
        });

        // Handle beforeunload for cleanup
        window.addEventListener('beforeunload', (event) => {
            this.handleBeforeUnload();
        });

        // Handle online/offline events
        window.addEventListener('online', () => {
            this.handleOnline();
        });

        window.addEventListener('offline', () => {
            this.handleOffline();
        });

        // Handle global key shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleGlobalKeyboard(event);
        });

        // REMOVED: Focus forcing that was interfering with inputs
        // REMOVED: Periodic check that was causing issues
        
        // Instead: Monitor input responsiveness in real-time
        this.setupInputResponsivenessMonitor();

        // Set up module integration
        this.setupModuleIntegration();

        console.log('Global event handlers set up');
    }

    setupModuleIntegration() {
        // Integrate UI with live sessions
        if (this.modules.ui && this.modules.websocket) {
            // Override UI startLiveSession to use WebSocket
            const originalStartSession = this.modules.ui.startLiveSession.bind(this.modules.ui);
            this.modules.ui.startLiveSession = () => {
                const sessionConfig = this.getSessionConfig();
                
                if (this.modules.websocket.isConnected) {
                    this.modules.websocket.startLiveSession(sessionConfig);
                }
                
                originalStartSession();
            };

            // Override UI stopLiveSession to use WebSocket
            const originalStopSession = this.modules.ui.stopLiveSession.bind(this.modules.ui);
            this.modules.ui.stopLiveSession = () => {
                if (this.modules.websocket.isConnected) {
                    this.modules.websocket.stopLiveSession();
                }
                
                originalStopSession();
            };
        }

        // Integrate settings with modules
        if (this.modules.ui) {
            // Override settings save to update module configurations
            const originalTestConnection = this.modules.ui.testConnection.bind(this.modules.ui);
            this.modules.ui.testConnection = async () => {
                const apiUrl = document.getElementById('apiUrlInput').value;
                const wsUrl = document.getElementById('wsUrlInput').value;
                
                // Update configurations
                this.updateConfiguration({ apiUrl, wsUrl });
                
                // Test both connections
                const results = await Promise.allSettled([
                    this.modules.api.testConnection(),
                    this.testWebSocketConnection(wsUrl)
                ]);

                const apiResult = results[0];
                const wsResult = results[1];

                // Connection test completed
            };
        }
    }

    async loadInitialData() {
        console.log('Loading initial data...');
        
        try {
            // Test backend connection
            const connectionTest = await this.modules.api.testConnection();
            
            if (connectionTest.success) {
                // Initialize default user
                await this.initializeDefaultUser();
                
                // Load dashboard data if we're on the dashboard (default view)
                if (this.modules.ui) {
                    const currentView = window.uiState?.currentView || 'dashboard';
                    if (currentView === 'dashboard') {
                        await this.modules.ui.loadViewData('dashboard');
                    }
                }
            } else {
                console.warn('Backend connection failed - working in offline mode');
            }
        } catch (error) {
            console.warn('Failed to load initial data:', error);
        }
        
        console.log('Initial data loading completed');
    }

    async initializeDefaultUser() {
        if (window.authManager?.isLoggedIn()) {
            this.currentUser = window.authManager.getCurrentUser();
            return this.currentUser;
        }
        
        try {
            try {
                this.currentUser = await this.modules.api.getUserByUsername('default_doctor');
            } catch (error) {
                try {
                    this.currentUser = await this.modules.api.createUser({
                        username: 'default_doctor',
                        email: 'doctor@neurofeedback.com',
                        first_name: 'Default',
                        last_name: 'Doctor',
                        password: 'neurofeedback123'
                    });
                } catch (createError) {
                    if (createError.message.includes('UNIQUE constraint') || createError.message.includes('already exists')) {
                        this.currentUser = await this.modules.api.getUserByUsername('default_doctor');
                    } else {
                        throw createError;
                    }
                }
            }
            
            if (!this.currentUser?.id) {
                throw new Error('Failed to create or retrieve default user');
            }
            
            localStorage.setItem('currentUserId', this.currentUser.id);
            localStorage.setItem('currentUserName', `${this.currentUser.first_name} ${this.currentUser.last_name}`);
            window.currentUser = this.currentUser;
            return this.currentUser;
        } catch (error) {
            try {
                const users = await this.modules.api.getUsers();
                if (users?.length > 0) {
                    this.currentUser = users[0];
                    localStorage.setItem('currentUserId', this.currentUser.id);
                    localStorage.setItem('currentUserName', `${this.currentUser.first_name} ${this.currentUser.last_name}`);
                    window.currentUser = this.currentUser;
                    return this.currentUser;
                }
            } catch (fallbackError) {
                console.error('Fallback failed:', fallbackError);
            }
            
            throw new Error('Unable to initialize any user. Please check backend connection.');
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getCurrentUserId() {
        return this.currentUser?.id || localStorage.getItem('currentUserId') || null;
    }

    async createDefaultUserManually() {
        const user = await this.modules.api.createUser({
            username: 'default_doctor',
            email: 'doctor@neurofeedback.local',
            first_name: 'Default',
            last_name: 'Doctor',
            password: 'neurofeedback123'
        });
        
        this.currentUser = user;
        localStorage.setItem('currentUserId', user.id);
        localStorage.setItem('currentUserName', `${user.first_name} ${user.last_name}`);
        window.currentUser = user;
        return user;
    }

    setupAutoSync() {
        if (!this.config.autoSync) return;
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    handlePageHidden() {
        this.modules.charts?.stopRealtimeSimulation();
        if (this.modules.websocket) {
            this.modules.websocket.maxReconnectAttempts = 1;
        }
    }

    handlePageVisible() {
        if (this.modules.websocket?.isLiveSessionActive) {
            this.modules.charts?.startRealtimeSimulation();
        }
        if (this.modules.websocket) {
            this.modules.websocket.maxReconnectAttempts = 5;
        }
        if (this.modules.ui?.currentView === 'dashboard') {
            this.modules.ui.loadViewData('dashboard').catch(console.error);
        }
    }

    handleBeforeUnload() {
        console.log('Application shutting down...');
        
        // Stop active sessions
        if (this.modules.websocket && this.modules.websocket.isLiveSessionActive) {
            this.modules.websocket.stopLiveSession();
        }
        
        // Disconnect WebSocket
        if (this.modules.websocket) {
            this.modules.websocket.disconnect();
        }
        
        // Stop auto-sync
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
        
        // Clean up charts
        if (this.modules.charts) {
            this.modules.charts.destroyAllCharts();
        }
        
        // Clear session so user needs to login again on next app start
        if (window.authManager) {
            window.authManager.clearSession();
        }
    }

    handleOnline() {
        if (this.modules.websocket && !this.modules.websocket.isConnected) {
            this.modules.websocket.connect().catch(console.error);
        }
        this.modules.ui?.loadViewData(this.modules.ui.currentView).catch(console.error);
    }

    handleOffline() {
        // Connection lost
    }

    handleGlobalKeyboard(event) {
        // Skip if user is typing in an input field
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        );
        
        // Handle ESC key to close modals (always allowed)
        if (event.key === 'Escape') {
            if (this.modules.ui && this.modules.ui.currentModal) {
                this.modules.ui.closeModal(this.modules.ui.currentModal);
            }
            return;
        }
        
        // Don't intercept keyboard events when user is typing
        if (isInputFocused) {
            return;
        }
        
        // Handle global keyboard shortcuts
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'n':
                    event.preventDefault();
                    if (this.modules.ui) {
                        this.modules.ui.switchView('live-session');
                    }
                    break;
                    
                case 'e':
                    event.preventDefault();
                    if (this.modules.ui) {
                        this.modules.ui.exportSessions();
                    }
                    break;
                    
                case 'r':
                    event.preventDefault();
                    window.location.reload();
                    break;
                    
                case ',':
                    event.preventDefault();
                    if (this.modules.ui) {
                        this.modules.ui.switchView('settings');
                    }
                    break;
            }
        }
    }

    handleInitializationError(error) {
        console.error('Application initialization error:', error);
        
        // Show fallback error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #000000;
            color: white;
            padding: 40px;
            border-radius: 8px;
            text-align: center;
            z-index: 10000;
            max-width: 500px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        `;
        
        errorDiv.innerHTML = `
            <h2 style="margin-bottom: 16px;">Application Error</h2>
            <p style="margin-bottom: 20px;">Failed to initialize the application.</p>
            <p style="font-size: 14px; color: #ccc; margin-bottom: 20px;">${error.message}</p>
            <button onclick="window.location.reload()" style="
                background: white;
                color: #000000;
                border: none;
                padding: 12px 24px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            ">Reload Application</button>
        `;
        
        document.body.appendChild(errorDiv);
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    updateConfiguration(newConfig) {
        // Update configuration and save to localStorage
        Object.keys(newConfig).forEach(key => {
            if (newConfig[key] !== null && newConfig[key] !== undefined) {
                this.config[key] = newConfig[key];
                localStorage.setItem(key, newConfig[key]);
            }
        });

        // Apply configuration to modules
        if (newConfig.apiUrl && this.modules.api) {
            this.modules.api.setBaseURL(newConfig.apiUrl);
        }
        
        if (newConfig.wsUrl && this.modules.websocket) {
            this.modules.websocket.setUrl(newConfig.wsUrl);
        }

        console.log('Configuration updated:', this.config);
    }

    getSessionConfig() {
        // Get current session configuration from UI
        const patientId = document.getElementById('sessionPatientSelect')?.value;
        const protocolSelect = document.getElementById('protocolTypeSelect');
        const protocolId = protocolSelect?.value ? parseInt(protocolSelect.value) : null;
        const protocolType = protocolSelect?.options[protocolSelect?.selectedIndex]?.textContent || 'TBR';
        const channels = this.modules.ui?.getSelectedChannels?.() || ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'Cz', 'Pz'];
        const rounds = parseInt(document.getElementById('sessionRoundsInput')?.value || '3');
        const userId = this.getCurrentUserId();

        const config = {
            patientId: parseInt(patientId),
            protocolType,
            channels,
            sessionRounds: rounds,
            sampleRate: 250,
            startTime: new Date().toISOString()
        };

        // Include protocol_id and user_id if protocol is selected (required for ratio protocols)
        if (protocolId) {
            config.protocol_id = protocolId;
            config.user_id = userId;
        }

        return config;
    }

    async testWebSocketConnection(url) {
        return new Promise((resolve, reject) => {
            const testWs = new WebSocket(url);
            const timeout = setTimeout(() => {
                testWs.close();
                reject(new Error('WebSocket test timeout'));
            }, 5000);

            testWs.addEventListener('open', () => {
                clearTimeout(timeout);
                testWs.close();
                resolve(true);
            });

            testWs.addEventListener('error', () => {
                clearTimeout(timeout);
                reject(new Error('WebSocket connection failed'));
            });
        });
    }

    getApplicationStatus() {
        return {
            isInitialized: this.isInitialized,
            config: this.config,
            modules: Object.keys(this.modules).reduce((status, name) => {
                status[name] = {
                    available: !!this.modules[name],
                    status: this.modules[name]?.getConnectionStatus?.() || 'unknown'
                };
                return status;
            }, {}),
            session: {
                isActive: this.modules.websocket?.isLiveSessionActive || false
            }
        };
    }

    // ========================================
    // INPUT ACCESSIBILITY CHECK
    // ========================================
    
    /**
     * Monitor input responsiveness - detect when inputs become unresponsive and fix immediately
     */
    setupInputResponsivenessMonitor() {
        // Track last successful input interaction
        let lastInputTime = Date.now();
        let freezeDetected = false;
        
        // Monitor all input interactions
        const monitorInput = (e) => {
            lastInputTime = Date.now();
            if (freezeDetected) {
                freezeDetected = false;
                console.log('[InputMonitor] Input responsiveness restored');
            }
        };
        
        // Listen to all input events
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
                monitorInput(e);
            }
        }, true); // Use capture phase
        
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
                monitorInput(e);
            }
        }, true);
        
        // Check every 2 seconds if inputs are responsive
        setInterval(() => {
            const timeSinceLastInput = Date.now() - lastInputTime;
            
            // If no input for 5 seconds and user is likely trying to interact, check for freeze
            if (timeSinceLastInput > 5000 && !freezeDetected) {
                // Check if loading overlay is blocking
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    const style = window.getComputedStyle(loadingOverlay);
                    if (style.display !== 'none' && window.uiState && !window.uiState.isLoading) {
                        console.warn('[InputMonitor] Detected stuck loading overlay - fixing immediately');
                        this.fixInputFreeze();
                        freezeDetected = true;
                    }
                }
                
                // Check for blocked pointer-events
                const bodyPE = window.getComputedStyle(document.body).pointerEvents;
                if (bodyPE === 'none' && !document.querySelector('.modal.active')) {
                    console.warn('[InputMonitor] Detected blocked body pointer-events - fixing immediately');
                    this.fixInputFreeze();
                    freezeDetected = true;
                }
            }
        }, 2000);
    }
    
    /**
     * Aggressively fix input freeze - called when freeze is detected
     */
    fixInputFreeze() {
        console.log('[FixInputFreeze] Applying aggressive fix...');
        
        // 1. Hide loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.pointerEvents = 'none';
            loadingOverlay.style.zIndex = '-1';
        }
        
        // 2. Reset all pointer-events
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
        
        // 3. Force enable all inputs
        document.querySelectorAll('input:not([disabled]), textarea:not([disabled]), select:not([disabled])').forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.removeProperty('pointer-events');
            el.removeAttribute('readonly');
            if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') === '-1') {
                el.removeAttribute('tabindex');
            }
        });
        
        // 4. Reset uiState
        if (window.uiState) {
            window.uiState.isLoading = false;
        }
        
        // 5. Force reflow to ensure changes take effect
        void document.body.offsetHeight;
        
        console.log('[FixInputFreeze] Fix applied');
    }

    // ========================================
    // PUBLIC API
    // ========================================

    restart() {
        window.location.reload();
    }

    async exportApplicationData() {
        try {
            if (this.modules.ui) {
                this.modules.ui.showLoading(true);
            }

            // Export all data
            const [csvData] = await Promise.all([
                this.modules.api.exportSessions('csv')
            ]);

            // Create and download file
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neurofeedback-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            if (this.modules.ui) {
                this.modules.ui.showLoading(false);
            }
        }
    }
}

// Create global application instance
window.neuroFeedbackApp = new NeuroFeedbackApp();

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, checking authentication...');
    
    // Wait for auth manager to be ready
    if (window.authManager && window.authManager.isLoggedIn()) {
        console.log('User authenticated, initializing application...');
        await window.neuroFeedbackApp.initialize();
    } else {
        console.log('User not authenticated, showing login screen...');
        // Auth manager will handle showing login screen
    }
});

// Make application available for debugging
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
    window.debugApp = () => {
        console.log('Application Status:', window.neuroFeedbackApp.getApplicationStatus());
    };
}