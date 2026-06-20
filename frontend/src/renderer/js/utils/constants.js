/**
 * Application Constants
 * Centralized constants used throughout the application
 */

// API Endpoints
export const API_ENDPOINTS = {
    // Authentication
    LOGIN: '/users/login',
    LOGOUT: '/users/logout',
    VERIFY: '/users/verify',
    
    // Users
    USERS: '/users/',
    USER_BY_ID: (id) => `/users/by-id/${id}`,
    USER_BY_USERNAME: (username) => `/users/by-username/${username}`,
    
    // Patients
    PATIENTS: '/patients/',
    PATIENT_BY_ID: (id) => `/patients/by-id/${id}`,
    PATIENTS_BY_DOCTOR: (doctorId) => `/patients/by-doctor/${doctorId}`,
    PATIENTS_BY_EMAIL: (email) => `/patients/by-email/${email}`,
    PATIENTS_BY_NAME: (firstName, lastName) => `/patients/by-name/?first_name=${firstName}&last_name=${lastName}`,
    
    // Sessions
    SESSIONS: '/sessions/',
    SESSION_BY_ID: (id) => `/sessions/by-id/${id}`,
    SESSIONS_BY_PATIENT: (patientId) => `/sessions/by-patient/${patientId}`,
    
    // Protocols (user-scoped, not patient-scoped)
    PROTOCOLS: '/protocols/',
    PROTOCOL_BY_ID: (id) => `/protocols/${id}`,
    
    // Health
    HEALTH: '/health',
    ROOT: '/'
};

// HTTP Status Codes
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
};

// UI Constants
export const UI_CONSTANTS = {
    // Loading states
    LOADING_DELAY: 300,
    TIMEOUT_DURATION: 10000,
    
    // Notifications
    NOTIFICATION_DURATION: 5000,
    NOTIFICATION_POSITIONS: {
        TOP_RIGHT: 'top-right',
        TOP_LEFT: 'top-left',
        BOTTOM_RIGHT: 'bottom-right',
        BOTTOM_LEFT: 'bottom-left'
    },
    
    // Views
    VIEWS: {
        DASHBOARD: 'dashboard',
        PATIENTS: 'patients',
        SESSIONS: 'sessions',
        PROTOCOLS: 'protocols',
        REPORTS: 'reports',
        SETTINGS: 'settings'
    },
    
    // Form validation
    VALIDATION: {
        MIN_PASSWORD_LENGTH: 6,
        MAX_NAME_LENGTH: 50,
        MAX_EMAIL_LENGTH: 100,
        MAX_DESCRIPTION_LENGTH: 500
    }
};

// WebSocket Events
export const WS_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ERROR: 'error',
    MESSAGE: 'message',
    DATA: 'data',
    STATUS: 'status'
};

// Local Storage Keys
export const STORAGE_KEYS = {
    SESSION: 'neurofeedback_session',
    CONFIG: 'neurofeedback_config',
    THEME: 'neurofeedback_theme',
    USER_PREFERENCES: 'neurofeedback_preferences'
};

// Error Messages
export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error - unable to reach server',
    AUTHENTICATION_FAILED: 'Authentication failed',
    INVALID_CREDENTIALS: 'Invalid username or password',
    SESSION_EXPIRED: 'Session expired, please login again',
    PERMISSION_DENIED: 'Permission denied',
    RESOURCE_NOT_FOUND: 'Resource not found',
    SERVER_ERROR: 'Server error occurred',
    VALIDATION_ERROR: 'Validation error'
};

// Success Messages
export const SUCCESS_MESSAGES = {
    LOGIN_SUCCESS: 'Login successful',
    LOGOUT_SUCCESS: 'Logout successful',
    SAVE_SUCCESS: 'Data saved successfully',
    DELETE_SUCCESS: 'Item deleted successfully',
    UPDATE_SUCCESS: 'Update successful',
    CONNECTION_SUCCESS: 'Connection established'
};
