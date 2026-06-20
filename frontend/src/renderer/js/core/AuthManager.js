/**
 * Authentication Manager - Handles user login/logout and session management
 */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.sessionKey = 'neurofeedback_session';
        
        // Check for existing session on initialization
        this.checkExistingSession();
    }

    // ========================================
    // SESSION MANAGEMENT
    // ========================================

    checkExistingSession() {
        try {
            const sessionData = localStorage.getItem(this.sessionKey);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                // Check if session is still valid (not expired)
                if (session.expiresAt && new Date() < new Date(session.expiresAt)) {
                    this.currentUser = session.user;
                    this.isAuthenticated = true;
                    
                    // Restore token to API module if available
                    if (session.token && window.api) {
                        console.log('Restoring token to API module:', session.token);
                        window.api.setAuthToken(session.token);
                    } else {
                        console.log('No token or API module not available:', { token: session.token, api: !!window.api });
                    }
                    
                    console.log('Existing session found:', this.currentUser);
                } else {
                    // Session expired, clear it
                    this.clearSession();
                }
            }
        } catch (error) {
            console.error('Error checking existing session:', error);
            this.clearSession();
        }
    }

    saveSession(user, token = null) {
        try {
            const session = {
                user: user,
                token: token,
                loginTime: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            };
            localStorage.setItem(this.sessionKey, JSON.stringify(session));
            this.currentUser = user;
            this.isAuthenticated = true;
            console.log('Session saved:', user);
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }

    clearSession() {
        localStorage.removeItem(this.sessionKey);
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Clear token from API module
        if (window.api) {
            window.api.clearAuthToken();
        }
        
        console.log('Session cleared');
    }

    // ========================================
    // AUTHENTICATION METHODS
    // ========================================

    async login(username, password) {
        try {
            console.log('Attempting login for:', username);
            
            if (!window.api) {
                throw new Error('API module not available');
            }

            const response = await window.api.login(username, password);
            
            if (response.success && response.user) {
                // Store the token in the API module for future requests
                if (response.token && window.api) {
                    console.log('Setting token in API module:', response.token);
                    window.api.setAuthToken(response.token);
                } else {
                    console.log('No token or API module not available:', { token: response.token, api: !!window.api });
                }
                this.saveSession(response.user, response.token);
                return {
                    success: true,
                    user: response.user,
                    message: response.message
                };
            } else {
                return {
                    success: false,
                    message: response.message || 'Login failed'
                };
            }
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: error.message || 'Login failed due to network error'
            };
        }
    }

    async createDefaultUser() {
        try {
            console.log('Creating default user...');
            
            if (!window.api) {
                throw new Error('API module not available');
            }

            // First, try to login with the default credentials
            const loginResult = await this.login('default_doctor', 'neurofeedback123');
            if (loginResult.success) {
                console.log('Default user already exists, logged in successfully');
                return loginResult;
            }

            // If login fails, try to create the user
            const userData = {
                username: 'default_doctor',
                email: 'doctor@neurofeedback.com',
                first_name: 'Default',
                last_name: 'Doctor',
                password: 'neurofeedback123'
            };

            try {
                const user = await window.api.createUser(userData);
                console.log('Default user created:', user);
                
                // Auto-login with the created user
                return await this.login(userData.username, userData.password);
            } catch (createError) {
                // If creation fails due to user already existing, try login again
                if (createError.message.includes('UNIQUE constraint') || createError.message.includes('already exists')) {
                    console.log('User already exists, attempting login...');
                    return await this.login(userData.username, userData.password);
                }
                throw createError;
            }
        } catch (error) {
            console.error('Error creating default user:', error);
            return {
                success: false,
                message: error.message || 'Failed to create default user'
            };
        }
    }

    logout() {
        this.clearSession();
        console.log('User logged out');
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    getCurrentUser() {
        return this.currentUser;
    }

    getCurrentUserId() {
        return this.currentUser?.id || null;
    }

    getUserDisplayName() {
        if (!this.currentUser) return 'Unknown User';
        return `Dr. ${this.currentUser.first_name} ${this.currentUser.last_name}`;
    }

    isLoggedIn() {
        return this.isAuthenticated && this.currentUser !== null;
    }

    // ========================================
    // UI INTEGRATION
    // ========================================

    showLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const loadingScreen = document.getElementById('appLoadingScreen');
        
        // Hide loading screen first
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (loginScreen && app) {
            loginScreen.style.display = 'flex';
            app.style.display = 'none';
        }
    }

    hideLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const loadingScreen = document.getElementById('appLoadingScreen');
        
        // Hide loading screen if still visible
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (loginScreen && app) {
            loginScreen.style.display = 'none';
            app.style.display = 'grid';
        }
    }

    updateUserInfo() {
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');
        const headerLogo = document.getElementById('headerLogo');

        if (userInfo && userName && this.currentUser) {
            userName.textContent = this.getUserDisplayName();
            userInfo.style.display = 'flex';
        }

        // Update header logo with app name
        if (headerLogo) {
            headerLogo.textContent = 'Alpha Neurofeedback';
        }

        // Update page title
        document.title = 'Alpha Neurofeedback';
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    setupLoginEventListeners() {
        // Prevent multiple event listener attachments
        if (this._listenersAttached) {
            return;
        }

        // Simple login button - creates/logs in with default user
        const loginBtn = document.getElementById('createDefaultUserBtn');
        if (loginBtn) {
            // Remove any existing listeners first
            const newLoginBtn = loginBtn.cloneNode(true);
            loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
            
            // Attach the event listener to the new button
            newLoginBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Prevent double-clicks
                if (newLoginBtn.disabled) return;
                await this.handleSimpleLogin();
            });
            
            this._listenersAttached = true;
            console.log('Login event listeners attached successfully');
        } else {
            console.warn('Login button not found, will retry...');
            // Retry after a short delay if button not found
            setTimeout(() => {
                if (!this._listenersAttached) {
                    this.setupLoginEventListeners();
                }
            }, 100);
        }
    }

    async handleLogin() {
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const btnSpinner = loginBtn.querySelector('.btn-spinner');

        if (!usernameInput || !passwordInput || !loginBtn) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            // Validation error
            return;
        }

        // Show loading state
        loginBtn.disabled = true;
        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline';

        try {
            const result = await this.login(username, password);
            
            if (result.success) {
                // Login successful
                this.hideLoginScreen();
                this.updateUserInfo();
                
                // Initialize the main app
                if (window.neuroFeedbackApp) {
                    await window.neuroFeedbackApp.initialize();
                }
            } else {
                console.error('Login error:', result.message);
                passwordInput.value = ''; // Clear password on failure
            }
        } catch (error) {
            console.error('Login handler error:', error);
            console.error('Login failed due to network error');
        } finally {
            // Reset button state
            loginBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
        }
    }

    /**
     * Wait until the backend is reachable before attempting login.
     * The login screen renders before the bundled backend (main.exe) has
     * finished starting, so the very first click would otherwise hit a
     * not-yet-listening server and fail silently. Poll /health briefly so a
     * single click reliably works instead of requiring a second tap.
     */
    async waitForBackend(timeoutMs = 15000, intervalMs = 400) {
        if (!window.api || typeof window.api.checkHealth !== 'function') {
            return true;
        }

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                await window.api.checkHealth();
                return true;
            } catch (error) {
                // Backend not up yet — wait and retry until the deadline.
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
        return false;
    }

    async handleSimpleLogin() {
        const loginBtn = document.getElementById('createDefaultUserBtn');
        if (!loginBtn) return;

        const btnText = loginBtn.querySelector('.btn-text');
        const btnSpinner = loginBtn.querySelector('.btn-spinner');

        // Show loading state
        loginBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnSpinner) btnSpinner.style.display = 'inline';

        try {
            // Make sure the backend is actually reachable before we try to log
            // in, otherwise the first click fails silently on a cold start.
            const backendReady = await this.waitForBackend();
            if (!backendReady) {
                this.showNotification('Cannot reach the server. Please try again in a moment.', 'error');
                console.error('Login aborted: backend did not become ready in time');
                return;
            }

            const result = await this.createDefaultUser();

            if (result.success) {
                // Logged in successfully
                this.hideLoginScreen();
                this.updateUserInfo();

                // Initialize the main app
                if (window.neuroFeedbackApp) {
                    await window.neuroFeedbackApp.initialize();
                }
            } else {
                this.showNotification(result.message || 'Login failed', 'error');
                console.error('Login error:', result.message);
            }
        } catch (error) {
            this.showNotification(error.message || 'Login failed', 'error');
            console.error('Login error:', error);
        } finally {
            // Reset button state
            loginBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnSpinner) btnSpinner.style.display = 'none';
        }
    }

    async handleCreateDefaultUser() {
        // Alias for backwards compatibility
        return this.handleSimpleLogin();
    }

    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.ui && typeof window.ui.showNotification === 'function') {
            window.ui.showNotification(message, type);
        } else {
            // Fallback notification
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Create global authentication manager instance
window.authManager = new AuthManager();

// Initialize authentication when DOM is ready
function initializeAuth() {
    // Ensure DOM is fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAuth);
        return;
    }
    
    // Hide loading screen first
    const loadingScreen = document.getElementById('appLoadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    
    // Setup login event listeners
    window.authManager.setupLoginEventListeners();
    
    // Check if user is already logged in
    if (window.authManager.isLoggedIn()) {
        window.authManager.hideLoginScreen();
        window.authManager.updateUserInfo();
    } else {
        window.authManager.showLoginScreen();
    }
}

// Initialize immediately if DOM is already ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    // DOM is already ready, initialize immediately
    setTimeout(initializeAuth, 0);
}
