/**
 * API Module - Handles all backend communication
 * Provides a clean interface for all REST API operations
 * Composed from modular API classes
 */

class API {
    constructor() {
        this.baseURL = 'http://localhost:8000';
        this.timeout = 10000;
        this.authToken = null;
        
        // Configure axios defaults
        axios.defaults.timeout = this.timeout;
        axios.defaults.baseURL = this.baseURL;
        
        // Add request interceptor for authentication
        axios.interceptors.request.use(
            config => {
                if (this.authToken) {
                    config.headers.Authorization = `Bearer ${this.authToken}`;
                }
                return config;
            },
            error => Promise.reject(error)
        );
        
        // Add request interceptor for error handling
        axios.interceptors.response.use(
            response => response,
            error => {
                if (error.code === 'ECONNABORTED') {
                    throw new Error('Request timeout');
                } else if (error.response) {
                    // Extract error message from response
                    const responseData = error.response.data;
                    let errorMessage = error.response.statusText || 'Request failed';
                    
                    if (responseData) {
                        if (responseData.detail) {
                            // Handle different detail formats
                            if (Array.isArray(responseData.detail)) {
                                // FastAPI validation errors format
                                errorMessage = responseData.detail
                                    .map(err => {
                                        const field = err.loc ? err.loc.join('.') : 'field';
                                        return `${field}: ${err.msg || err.message || 'validation error'}`;
                                    })
                                    .join('; ');
                            } else if (typeof responseData.detail === 'string') {
                                errorMessage = responseData.detail;
                            } else if (responseData.detail.message) {
                                errorMessage = responseData.detail.message;
                            } else {
                                errorMessage = JSON.stringify(responseData.detail);
                            }
                        } else if (responseData.message) {
                            errorMessage = responseData.message;
                        } else if (typeof responseData === 'string') {
                            errorMessage = responseData;
                        }
                    }
                    
                    // Enhance error with status code info
                    const enhancedError = new Error(errorMessage);
                    enhancedError.status = error.response.status;
                    enhancedError.response = error.response;
                    throw enhancedError;
                } else if (error.request) {
                    throw new Error('Network error - unable to reach server');
                } else {
                    throw error;
                }
            }
        );

        // Initialize API modules (will be available after module scripts load)
        if (typeof UserAPI !== 'undefined') {
            this._userAPI = new UserAPI(axios, (token) => this.setAuthToken(token));
            this._authAPI = new AuthAPI(axios, (token) => this.setAuthToken(token));
            this._patientAPI = new PatientAPI(axios);
            this._sessionAPI = new SessionAPI(axios);
            this._assessmentAPI = new AssessmentAPI(axios, this._sessionAPI);
            this._protocolAPI = new ProtocolAPI(axios);
            this._signalProcessingAPI = new SignalProcessingAPI(axios);
            this._webSocketAPI = new WebSocketAPI();
            this._analyticsAPI = new AnalyticsAPI(axios, this._sessionAPI);
            this._exportAPI = new ExportAPI(this._sessionAPI, this._patientAPI, this._userAPI);
            this._dashboardAPI = new DashboardAPI(this._userAPI, this._patientAPI, this._sessionAPI);
        }
    }

    // Initialize modules when they're available
    _initializeModules() {
        if (!this._userAPI && typeof UserAPI !== 'undefined') {
            this._userAPI = new UserAPI(axios, (token) => this.setAuthToken(token));
            this._authAPI = new AuthAPI(axios, (token) => this.setAuthToken(token));
            this._patientAPI = new PatientAPI(axios);
            this._sessionAPI = new SessionAPI(axios);
            this._assessmentAPI = new AssessmentAPI(axios, this._sessionAPI);
            this._protocolAPI = new ProtocolAPI(axios);
            this._signalProcessingAPI = new SignalProcessingAPI(axios);
            this._webSocketAPI = new WebSocketAPI();
            this._analyticsAPI = new AnalyticsAPI(axios, this._sessionAPI);
            this._exportAPI = new ExportAPI(this._sessionAPI, this._patientAPI, this._userAPI);
            this._dashboardAPI = new DashboardAPI(this._userAPI, this._patientAPI, this._sessionAPI);
        }
    }

    _ensureModules() {
        if (!this._userAPI) {
            this._initializeModules();
        }
    }

    // ========================================
    // CORE CONFIGURATION
    // ========================================

    setBaseURL(url) {
        this.baseURL = url;
        axios.defaults.baseURL = url;
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    clearAuthToken() {
        this.authToken = null;
    }

    getAuthToken() {
        return this.authToken;
    }

    async checkHealth() {
        try {
            const response = await axios.get('/health');
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async testConnection() {
        try {
            const response = await axios.get('/');
            return {
                success: true,
                data: response.data,
                status: response.status
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status || null
            };
        }
    }

    // ========================================
    // USER MANAGEMENT - Delegate to UserAPI
    // ========================================

    async createUser(userData) {
        this._ensureModules();
        return this._userAPI.createUser(userData);
    }

    async getUsers(skip = 0, limit = 100) {
        this._ensureModules();
        return this._userAPI.getUsers(skip, limit);
    }

    async getUserById(userId) {
        this._ensureModules();
        return this._userAPI.getUserById(userId);
    }

    async getUserByEmail(email) {
        this._ensureModules();
        return this._userAPI.getUserByEmail(email);
    }

    async getUserByUsername(username) {
        this._ensureModules();
        return this._userAPI.getUserByUsername(username);
    }

    async getUsersByName(firstName, lastName) {
        this._ensureModules();
        return this._userAPI.getUsersByName(firstName, lastName);
    }

    async updateUser(userId, userData) {
        this._ensureModules();
        return this._userAPI.updateUser(userId, userData);
    }

    async deleteUser(userId) {
        this._ensureModules();
        return this._userAPI.deleteUser(userId);
    }

    // ========================================
    // AUTHENTICATION - Delegate to AuthAPI
    // ========================================

    async login(username, password) {
        this._ensureModules();
        return this._authAPI.login(username, password);
    }

    async verifyPassword(userId, password) {
        this._ensureModules();
        return this._authAPI.verifyPassword(userId, password);
    }

    // ========================================
    // PATIENT MANAGEMENT - Delegate to PatientAPI
    // ========================================

    async createPatient(patientData) {
        this._ensureModules();
        return this._patientAPI.createPatient(patientData);
    }

    async getPatients(skip = 0, limit = 100) {
        this._ensureModules();
        return this._patientAPI.getPatients(skip, limit);
    }

    async getAllPatients(batchSize = 200) {
        this._ensureModules();
        return this._patientAPI.getAllPatients(batchSize);
    }

    async getPatientById(patientId) {
        this._ensureModules();
        return this._patientAPI.getPatientById(patientId);
    }

    async getPatient(patientId) {
        return this.getPatientById(patientId);
    }

    async getPatientsByDoctor(doctorId) {
        this._ensureModules();
        return this._patientAPI.getPatientsByDoctor(doctorId);
    }

    async getPatientByEmail(email) {
        this._ensureModules();
        return this._patientAPI.getPatientByEmail(email);
    }

    async getPatientsByName(firstName, lastName) {
        this._ensureModules();
        return this._patientAPI.getPatientsByName(firstName, lastName);
    }

    async updatePatient(patientId, patientData) {
        this._ensureModules();
        return this._patientAPI.updatePatient(patientId, patientData);
    }

    async deletePatient(patientId) {
        this._ensureModules();
        return this._patientAPI.deletePatient(patientId);
    }

    // ========================================
    // SESSION MANAGEMENT - Delegate to SessionAPI
    // ========================================

    async createSession(sessionData) {
        this._ensureModules();
        return this._sessionAPI.createSession(sessionData);
    }

    async getSessions(skip = 0, limit = 100) {
        this._ensureModules();
        return this._sessionAPI.getSessions(skip, limit);
    }

    async getSessionById(sessionId) {
        this._ensureModules();
        return this._sessionAPI.getSessionById(sessionId);
    }

    async getSessionsByPatient(patientId) {
        this._ensureModules();
        return this._sessionAPI.getSessionsByPatient(patientId);
    }

    async getSessionsByDoctor(doctorId) {
        this._ensureModules();
        return this._sessionAPI.getSessionsByDoctor(doctorId);
    }

    async getSessionsByPatientDoctor(patientId, doctorId) {
        this._ensureModules();
        return this._sessionAPI.getSessionsByPatientDoctor(patientId, doctorId);
    }


    async getSessionsByProtocol(protocolType) {
        this._ensureModules();
        return this._sessionAPI.getSessionsByProtocol(protocolType);
    }

    async getSessionsByDateRange(startDate, endDate) {
        this._ensureModules();
        return this._sessionAPI.getSessionsByDateRange(startDate, endDate);
    }

    async updateSession(sessionId, sessionData) {
        this._ensureModules();
        return this._sessionAPI.updateSession(sessionId, sessionData);
    }

    async completeSession(sessionId, endTime = null) {
        this._ensureModules();
        return this._sessionAPI.completeSession(sessionId, endTime);
    }

    async deleteSession(sessionId) {
        this._ensureModules();
        return this._sessionAPI.deleteSession(sessionId);
    }

    // ========================================
    // DASHBOARD & STATISTICS - Delegate to DashboardAPI
    // ========================================

    async getDashboardStats() {
        this._ensureModules();
        return this._dashboardAPI.getDashboardStats();
    }

    // ========================================
    // DATA EXPORT - Delegate to ExportAPI
    // ========================================

    async exportSessions(format = 'csv') {
        this._ensureModules();
        return this._exportAPI.exportSessions(format);
    }

    convertToCSV(data) {
        this._ensureModules();
        return this._exportAPI.convertToCSV(data);
    }

    // ========================================
    // SIGNAL PROCESSING & NEUROFEEDBACK - Delegate to SignalProcessingAPI
    // ========================================

    async getDeviceStatus() {
        this._ensureModules();
        return this._signalProcessingAPI.getDeviceStatus();
    }

    async stopNeurofeedbackCore() {
        this._ensureModules();
        return this._signalProcessingAPI.stopNeurofeedbackCore();
    }

    // ========================================
    // WEBSOCKET MANAGEMENT - Delegate to WebSocketAPI
    // ========================================

    createWebSocketConnection(endpoint = '/sp/nfcore_start', baseWsUrl = 'ws://localhost:8000') {
        this._ensureModules();
        return this._webSocketAPI.createWebSocketConnection(endpoint, baseWsUrl);
    }

    // ========================================
    // ASSESSMENT & TREATMENT PLANNING - Delegate to AssessmentAPI
    // ========================================

    async createAssessment(patientId, assessmentData) {
        this._ensureModules();
        return this._assessmentAPI.createAssessment(patientId, assessmentData);
    }

    async getAssessmentByPatient(patientId) {
        this._ensureModules();
        return this._assessmentAPI.getAssessmentByPatient(patientId);
    }

    async saveTreatmentPlan(patientId, treatmentPlan) {
        this._ensureModules();
        return this._assessmentAPI.saveTreatmentPlan(patientId, treatmentPlan);
    }

    async getTreatmentPlan(patientId) {
        this._ensureModules();
        return this._assessmentAPI.getTreatmentPlan(patientId);
    }

    async createDisorder(disorderData) {
        this._ensureModules();
        return this._assessmentAPI.createDisorder(disorderData);
    }

    async updateDisorderForPatient(patientId, disorderData) {
        this._ensureModules();
        return this._assessmentAPI.updateDisorderForPatient(patientId, disorderData);
    }

    async getPatientLatestDisorder(patientId) {
        this._ensureModules();
        return this._assessmentAPI.getPatientLatestDisorder(patientId);
    }

    async getScenariosByDisorder(disorderName) {
        this._ensureModules();
        return this._assessmentAPI.getScenariosByDisorder(disorderName);
    }

    async getTreatmentPlanByPatient(patientId) {
        this._ensureModules();
        return this._assessmentAPI.getTreatmentPlanByPatient(patientId);
    }

    async generatePlanFromDisorder(disorderName, patientId, totalSessions = null) {
        this._ensureModules();
        return this._assessmentAPI.generatePlanFromDisorder(disorderName, patientId, totalSessions);
    }

    async generateAndCreatePlanFromDisorder(disorderName, patientId, totalSessions = null) {
        this._ensureModules();
        return this._assessmentAPI.generateAndCreatePlanFromDisorder(disorderName, patientId, totalSessions);
    }

    // ========================================
    // PROTOCOL & SCENARIO MANAGEMENT - Delegate to ProtocolAPI
    // ========================================

    async getAllProtocols() {
        this._ensureModules();
        return this._protocolAPI.getAllProtocols();
    }

    async getProtocolsByPatient(patientId) {
        // DEPRECATED: Protocols are user-scoped. Returns all protocols for current user.
        this._ensureModules();
        return this._protocolAPI.getProtocolsByPatient(patientId);
    }

    async initializeDefaultProtocols() {
        // Protocols are user-scoped - initialize defaults for current user
        this._ensureModules();
        return this._protocolAPI.initializeDefaultProtocols();
    }

    async createProtocol(protocolData) {
        this._ensureModules();
        return this._protocolAPI.createProtocol(protocolData);
    }

    async updateProtocol(protocolId, protocolData) {
        this._ensureModules();
        return this._protocolAPI.updateProtocol(protocolId, protocolData);
    }

    async deleteProtocol(protocolId) {
        this._ensureModules();
        return this._protocolAPI.deleteProtocol(protocolId);
    }

    async getProtocol(protocolId) {
        this._ensureModules();
        return this._protocolAPI.getProtocol(protocolId);
    }

    getDefaultProtocols() {
        this._ensureModules();
        return this._protocolAPI.getDefaultProtocols();
    }

    getDefaultScenarios() {
        this._ensureModules();
        return this._protocolAPI.getDefaultScenarios();
    }

    // ========================================
    // PROGRESS TRACKING & ANALYTICS - Delegate to AnalyticsAPI
    // ========================================

    async getPatientProgress(patientId) {
        this._ensureModules();
        return this._analyticsAPI.getPatientProgress(patientId);
    }

    async getSessionAnalytics(sessionId) {
        this._ensureModules();
        return this._analyticsAPI.getSessionAnalytics(sessionId);
    }
}

// Create global API instance
window.api = new API();
