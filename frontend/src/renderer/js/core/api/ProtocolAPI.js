/**
 * Protocol & Scenario Management API Module
 * Handles protocol and scenario-related operations
 */

class ProtocolAPI {
    constructor(axios) {
        this.axios = axios;
    }

    async getAllProtocols() {
        try {
            // Protocols belong to users, not patients - get all protocols for current user
            const response = await this.axios.get('/protocols/');
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async getProtocolsByPatient(patientId) {
        // DEPRECATED: Protocols are now user-scoped, not patient-scoped
        // This method kept for backwards compatibility but returns all user protocols
        return this.getAllProtocols();
    }

    async initializeDefaultProtocols() {
        try {
            // Protocols belong to users, not patients - initialize defaults for current user
            const response = await this.axios.post('/protocols/initialize-defaults');
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async createProtocol(protocolData) {
        try {
            const response = await this.axios.post('/protocols/', protocolData);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async updateProtocol(protocolId, protocolData) {
        try {
            const response = await this.axios.put(`/protocols/${protocolId}`, protocolData);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async deleteProtocol(protocolId) {
        try {
            const response = await this.axios.delete(`/protocols/${protocolId}`);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async getProtocol(protocolId) {
        try {
            const response = await this.axios.get(`/protocols/${protocolId}`);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    // DEPRECATED: Use getAllProtocols() to get protocols from the backend instead
    // This method is kept for backwards compatibility but returns empty array
    // All protocols should be fetched from the backend via getAllProtocols()
    getDefaultProtocols() {
        console.warn('getDefaultProtocols() is deprecated. Use getAllProtocols() to get protocols from the backend.');
        return [];
    }

    getDefaultScenarios() {
        return [
            {
                id: 'S1',
                name: 'Depression',
                symptoms: ['Low mood', 'Fatigue', 'Loss of interest'],
                recommendedProtocols: ['P1', 'P4'],
                typical_sessions: 20,
                frequency_per_week: 2
            },
            {
                id: 'S2',
                name: 'Anxiety',
                symptoms: ['Worry', 'Restlessness', 'Panic'],
                recommendedProtocols: ['P2', 'P4'],
                typical_sessions: 15,
                frequency_per_week: 2
            },
            {
                id: 'S3',
                name: 'ADHD/Attention',
                symptoms: ['Inattention', 'Hyperactivity', 'Impulsivity'],
                recommendedProtocols: ['P3', 'P5'],
                typical_sessions: 25,
                frequency_per_week: 3
            },
            {
                id: 'S4',
                name: 'Agitation/Anger',
                symptoms: ['Irritability', 'Anger outbursts', 'Aggression'],
                recommendedProtocols: ['P2', 'P4'],
                typical_sessions: 18,
                frequency_per_week: 2
            },
            {
                id: 'S5',
                name: 'Sleep Issues',
                symptoms: ['Insomnia', 'Light sleep', 'Night waking'],
                recommendedProtocols: ['P5', 'P4'],
                typical_sessions: 12,
                frequency_per_week: 2
            },
            {
                id: 'S6',
                name: 'Trauma/PTSD',
                symptoms: ['Flashbacks', 'Hypervigilance', 'Avoidance'],
                recommendedProtocols: ['P2', 'P4'],
                typical_sessions: 30,
                frequency_per_week: 2
            }
        ];
    }
}

