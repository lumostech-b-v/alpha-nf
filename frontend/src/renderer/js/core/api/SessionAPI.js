/**
 * Session Management API Module
 * Handles all session-related operations
 */

class SessionAPI {
    constructor(axios) {
        this.axios = axios;
    }

    async createSession(sessionData) {
        const response = await this.axios.post('/sessions/', sessionData);
        return response.data;
    }

    async getSessions(skip = 0, limit = 100) {
        const response = await this.axios.get('/sessions/', {
            params: { skip, limit }
        });
        return response.data;
    }

    async getSessionById(sessionId) {
        const response = await this.axios.get(`/sessions/by-id/${sessionId}`);
        return response.data;
    }

    async getSessionsByPatient(patientId) {
        const response = await this.axios.get(`/sessions/by-patient/${patientId}`);
        return response.data;
    }

    async getSessionsByDoctor(doctorId) {
        const response = await this.axios.get(`/sessions/by-doctor/${doctorId}`);
        return response.data;
    }

    async getSessionsByPatientDoctor(patientId, doctorId) {
        const response = await this.axios.get(`/sessions/by-patient-doctor/${patientId}/${doctorId}`);
        return response.data;
    }

    async getSessionsByType(sessionType) {
        const response = await this.axios.get(`/sessions/by-type/${sessionType}`);
        return response.data;
    }

    async getSessionsByProtocol(protocolType) {
        const response = await this.axios.get(`/sessions/by-protocol/${protocolType}`);
        return response.data;
    }

    async getSessionsByDateRange(startDate, endDate) {
        const response = await this.axios.get('/sessions/by-date-range/', {
            params: { 
                start_date: startDate, 
                end_date: endDate 
            }
        });
        return response.data;
    }

    async updateSession(sessionId, sessionData) {
        const response = await this.axios.put(`/sessions/${sessionId}`, sessionData);
        return response.data;
    }

    async completeSession(sessionId, endTime = null) {
        const params = endTime ? { end_time: endTime } : {};
        const response = await this.axios.patch(`/sessions/${sessionId}/complete`, null, { params });
        return response.data;
    }

    async deleteSession(sessionId) {
        const response = await this.axios.delete(`/sessions/${sessionId}`);
        return response.data;
    }
}

