/**
 * API.js
 * Centralized Service Layer for all Backend interactions.
 * Handles Error logging, JSON parsing, and HTTP status checks.
 */
export class API {
    static async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    static async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    static async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    static async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    static async upload(endpoint, formData) {
        // Fetch handles FormData content-type automatically (multipart/form-data)
        return this.request(endpoint, {
            method: 'POST',
            body: formData
        }, true); // Skip JSON stringify check
    }

    /**
     * Internal request handler
     */
    static async request(endpoint, options) {
        try {
            const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
            const response = await fetch(url, options);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Attempt to parse JSON
            try {
                return await response.json();
            } catch (e) {
                return {}; // Return empty object if no JSON body (e.g. 204 No Content)
            }
        } catch (error) {
            console.error(`[API] Request Failed: ${endpoint}`, error);
            // Re-throw so caller can handle UI feedback
            throw error;
        }
    }
}
