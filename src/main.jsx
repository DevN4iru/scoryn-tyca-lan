/**
 * Main Entry Point - SaaS Application Integration
 * Initialize configuration and start the app
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeConfig, getConfig } from './config/loadConfig.js';
import { apiClient } from './api/ApiClient.js';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import './styles/theme.css';
import App from './App.jsx';

/**
 * Initialize and mount application
 */
async function main() {
  try {
    // Initialize configuration
    // Load from: defaults → environment → tenant-specific file → runtime config
    const tenantId = localStorage.getItem('tenantId') || 'default';
    await initializeConfig(tenantId);

    // Initialize API client
    apiClient.initialize();

    // Add authentication interceptor example
    apiClient.addRequestInterceptor(async (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Mount React app with theme provider
    const root = createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </React.StrictMode>
    );

    console.log('✅ Application initialized successfully');
    console.log('App Name:', getConfig('branding.appName'));
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    // Still mount app with defaults if initialization fails
    const root = createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </React.StrictMode>
    );
  }
}

// Start the app
main();
