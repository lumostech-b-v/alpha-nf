/**
 * Signal Processing & Neurofeedback API Module
 * Handles device status and neurofeedback core operations
 */

class SignalProcessingAPI {
    constructor(axios) {
        this.axios = axios;
    }

    async getDeviceStatus() {
        try {
            const response = await this.axios.get('/sp/device/status');
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async stopNeurofeedbackCore() {
        try {
            const response = await this.axios.post('/sp/nfcore_stop');
            return response.data;
        } catch (error) {
            throw error;
        }
    }
}

