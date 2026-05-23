/**
 * Default SaaS Configuration
 * All customizable settings with safe defaults
 */

export const DEFAULT_CONFIG = {
  // Branding
  branding: {
    appName: 'Scoryn',
    appLogo: '/logo.png',
    favicon: '/favicon.ico',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    accentColor: '#ec4899',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '0.5rem',
  },

  // Features
  features: {
    authentication: true,
    userProfiles: true,
    analytics: false,
    notifications: true,
    darkMode: true,
    multiLanguage: false,
  },

  // API Configuration
  api: {
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  },

  // Pagination
  pagination: {
    defaultPageSize: 10,
    maxPageSize: 100,
  },

  // Feature Flags
  featureFlags: {
    betaFeatures: false,
    experimentalUI: false,
    maintenanceMode: false,
  },

  // Content
  content: {
    pageTitle: 'Miss TYCA 2026',
    tagline: 'Empowering Excellence',
    footerText: '© 2026 Scoryn. All rights reserved.',
  },

  // Limits
  limits: {
    maxUploadSize: 10 * 1024 * 1024, // 10MB
    maxRequestSize: 5 * 1024 * 1024, // 5MB
  },
};

export const THEME_PRESETS = {
  light: {
    background: '#ffffff',
    surface: '#f9fafb',
    text: '#111827',
    textSecondary: '#6b7280',
  },
  dark: {
    background: '#111827',
    surface: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#d1d5db',
  },
};
