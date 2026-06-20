/**
 * User Management API Module
 * Handles all user-related operations
 */

class UserAPI {
    constructor(axios, setAuthToken) {
        this.axios = axios;
        this.setAuthToken = setAuthToken;
    }

    async createUser(userData) {
        const response = await this.axios.post('/users/', userData);
        return response.data;
    }

    async getUsers(skip = 0, limit = 100) {
        const response = await this.axios.get('/users/', {
            params: { skip, limit }
        });
        return response.data;
    }

    async getUserById(userId) {
        const response = await this.axios.get(`/users/by-id/${userId}`);
        return response.data;
    }

    async getUserByEmail(email) {
        const response = await this.axios.get(`/users/by-email/${encodeURIComponent(email)}`);
        return response.data;
    }

    async getUserByUsername(username) {
        const response = await this.axios.get(`/users/by-username/${encodeURIComponent(username)}`);
        return response.data;
    }

    async getUsersByName(firstName, lastName) {
        const response = await this.axios.get('/users/by-name/', {
            params: { first_name: firstName, last_name: lastName }
        });
        return response.data;
    }

    async updateUser(userId, userData) {
        const response = await this.axios.put(`/users/${userId}`, userData);
        return response.data;
    }

    async deleteUser(userId) {
        const response = await this.axios.delete(`/users/${userId}`);
        return response.data;
    }
}

