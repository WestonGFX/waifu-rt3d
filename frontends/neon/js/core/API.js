/**
 * API.js
 * Centralized Service Layer for all Backend interactions.
 * Handles Error logging, JSON parsing, and HTTP status checks.
 */
import { toast } from '../utils/Toast.js';

export class API {
    static async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    static async post(endpoint, body, options = {}) {
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...options // Merge in options like signal for abort
        };
        return this.request(endpoint, fetchOptions);
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
     * Internal request handler with retry logic
     */
    static async request(endpoint, options, skipRetry = false) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
                const response = await fetch(url, options);

                if (!response.ok) {
                    const errorText = await response.text();
                    const error = new Error(`HTTP ${response.status}: ${errorText}`);
                    error.status = response.status;
                    throw error;
                }

                // Attempt to parse JSON
                try {
                    return await response.json();
                } catch (e) {
                    return {}; // Return empty object if no JSON body (e.g. 204 No Content)
                }
            } catch (error) {
                const isLastAttempt = attempt === maxRetries - 1;
                const isAborted = error.name === 'AbortError';
                const isNetworkError = !error.status || error.status >= 500;
                const shouldRetry = !skipRetry && !isAborted && isNetworkError && !isLastAttempt;

                if (shouldRetry) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`[API] Retry ${attempt + 1}/${maxRetries} for ${endpoint} after ${delay}ms`);
                    toast.warning(`Connection issue. Retrying... (${attempt + 1}/${maxRetries})`, delay);

                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }

                // Final failure or non-retryable error
                console.error(`[API] Request Failed: ${endpoint}`, error);

                // Show user-visible error toast (skip for user-initiated aborts
                // and when the backend-offline banner is already visible to avoid
                // duplicate error notifications)
                const offlineBanner = document.getElementById('backend-offline-banner');
                const bannerVisible = offlineBanner && offlineBanner.style.display !== 'none';
                if (!isAborted && !bannerVisible) {
                    const errorMsg = error.message || 'Network request failed';
                    toast.error(`API Error: ${errorMsg}`, 5000);
                }

                throw error;
            }
        }
    }
}
