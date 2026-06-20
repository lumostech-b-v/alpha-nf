/**
 * Patient Management API Module
 * Handles all patient-related operations
 */

class PatientAPI {
    constructor(axios) {
        this.axios = axios;
    }

    async createPatient(patientData) {
        const response = await this.axios.post('/patients/', patientData);
        return response.data;
    }

    async getPatients(skip = 0, limit = 100) {
        const response = await this.axios.get('/patients/', {
            params: { skip, limit }
        });
        return response.data;
    }

    async getAllPatients(batchSize = 200) {
        let allPatients = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await this.getPatients(skip, batchSize);
            allPatients = allPatients.concat(batch);
            hasMore = batch.length === batchSize;
            skip += batchSize;
        }

        return allPatients;
    }

    async getPatientById(patientId) {
        const response = await this.axios.get(`/patients/by-id/${patientId}`);
        return response.data;
    }

    async getPatientsByDoctor(doctorId) {
        const response = await this.axios.get(`/patients/by-doctor/${doctorId}`);
        return response.data;
    }

    async getPatientByEmail(email) {
        const response = await this.axios.get(`/patients/by-email/${encodeURIComponent(email)}`);
        return response.data;
    }

    async getPatientsByName(firstName, lastName) {
        const response = await this.axios.get('/patients/by-name/', {
            params: { first_name: firstName, last_name: lastName }
        });
        return response.data;
    }

    async updatePatient(patientId, patientData) {
        const response = await this.axios.put(`/patients/${patientId}`, patientData);
        return response.data;
    }

    async deletePatient(patientId) {
        const response = await this.axios.delete(`/patients/${patientId}`);
        return response.data;
    }
}
