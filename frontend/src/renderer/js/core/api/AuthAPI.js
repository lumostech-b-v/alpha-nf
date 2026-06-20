/**
 * Authentication API Module
 * Handles authentication-related operations
 */

class AuthAPI {
    constructor(axios, setAuthToken) {
        this.axios = axios;
        this.setAuthToken = setAuthToken;
    }

    async login(username, password) {
        const response = await this.axios.post('/users/login', {
            username: username,
            password: password
        });
        
        // Store the authentication token if provided
        if (response.data.token) {
            this.setAuthToken(response.data.token);
        } else if (response.data.access_token) {
            this.setAuthToken(response.data.access_token);
        }
        
        return response.data;
    }

    async verifyPassword(userId, password) {
        const response = await this.axios.post('/users/verify-password', null, {
            params: { user_id: userId, password: password }
        });
        return response.data;
    }
}

