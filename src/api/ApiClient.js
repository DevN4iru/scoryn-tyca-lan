/**
 * ApiClient - Centralized API communication layer
 * Handles authentication, retries, error handling
 */

import { getConfig } from '../config/loadConfig.js';

class ApiClient {
  constructor() {
    this.client = null;
    this.interceptors = {
      request: [],
      response: [],
      error: [],
    };
  }

  /**
   * Initialize API client with configuration
   */
  initialize() {
    const baseURL = getConfig('api.baseURL');
    const timeout = getConfig('api.timeout');

    this.config = {
      baseURL,
      timeout,
      retryAttempts: getConfig('api.retryAttempts', 3),
      retryDelay: getConfig('api.retryDelay', 1000),
    };
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(callback) {
    this.interceptors.request.push(callback);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(callback) {
    this.interceptors.response.push(callback);
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(callback) {
    this.interceptors.error.push(callback);
  }

  /**
   * Make HTTP request with retry logic
   */
  async request(method, endpoint, data = null, options = {}) {
    if (!this.config) {
      this.initialize();
    }

    let lastError;
    const maxAttempts = options.retryAttempts || this.config.retryAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Build full URL
        const url = endpoint.startsWith('http')
          ? endpoint
          : `${this.config.baseURL}${endpoint}`;

        // Prepare request config
        let requestConfig = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          timeout: this.config.timeout,
        };

        // Execute request interceptors
        for (const interceptor of this.interceptors.request) {
          requestConfig = await interceptor(requestConfig);
        }

        // Add body for non-GET requests
        if (data && method !== 'GET') {
          requestConfig.body = JSON.stringify(data);
        }

        // Make request
        const response = await fetch(url, requestConfig);

        // Parse response
        let responseData;
        try {
          responseData = await response.json();
        } catch {
          responseData = await response.text();
        }

        // Handle non-2xx status codes
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.data = responseData;
          throw error;
        }

        // Execute response interceptors
        for (const interceptor of this.interceptors.response) {
          responseData = await interceptor(responseData);
        }

        return responseData;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (
          !this._isRetryableError(error) ||
          attempt === maxAttempts
        ) {
          // Execute error interceptors
          for (const interceptor of this.interceptors.error) {
            await interceptor(error);
          }
          throw error;
        }

        // Wait before retry
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * GET request
   */
  get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  /**
   * POST request
   */
  post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * PUT request
   */
  put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  /**
   * PATCH request
   */
  patch(endpoint, data, options = {}) {
    return this.request('PATCH', endpoint, data, options);
  }

  /**
   * DELETE request
   */
  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Network errors are retryable
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }

    // HTTP 5xx errors are retryable
    if (error.status && error.status >= 500) {
      return true;
    }

    // HTTP 429 (Too Many Requests) is retryable
    if (error.status === 429) {
      return true;
    }

    // Timeout is retryable
    if (error.name === 'TimeoutError') {
      return true;
    }

    return false;
  }
}

// Export singleton
export const apiClient = new ApiClient();
