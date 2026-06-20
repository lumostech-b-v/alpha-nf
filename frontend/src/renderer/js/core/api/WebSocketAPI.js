/**
 * WebSocket Management API Module
 * Handles WebSocket connection creation
 */

class WebSocketAPI {
    constructor(baseWsUrl = 'ws://localhost:8000') {
        this.baseWsUrl = baseWsUrl;
    }

    createWebSocketConnection(endpoint = '/sp/nfcore_start', baseWsUrl = null) {
        const wsUrl = `${baseWsUrl || this.baseWsUrl}${endpoint}`;
        
        try {
            const ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                // WebSocket connection opened
            };
            
            ws.onclose = (event) => {
                // WebSocket connection closed
            };
            
            ws.onerror = (error) => {
                // WebSocket error
            };
            
            return ws;
        } catch (error) {
            throw error;
        }
    }
}

