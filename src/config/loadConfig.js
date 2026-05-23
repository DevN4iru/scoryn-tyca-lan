/**
 * Configuration Loader - Loads config from multiple sources
 * Priority: Environment > Custom File > Defaults
 */

import { configManager } from './ConfigManager.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Load configuration from environment variables
 * @private
 */
function loadFromEnv() {
  const envConfig = {};

  // Branding from environment
  if (process.env.REACT_APP_NAME) envConfig.appName = process.env.REACT_APP_NAME;
  if (process.env.REACT_APP_PRIMARY_COLOR) envConfig.primaryColor = process.env.REACT_APP_PRIMARY_COLOR;
  if (process.env.REACT_APP_SECONDARY_COLOR) envConfig.secondaryColor = process.env.REACT_APP_SECONDARY_COLOR;
  if (process.env.REACT_APP_API_URL) envConfig.api = { baseURL: process.env.REACT_APP_API_URL };

  // Features from environment
  if (process.env.REACT_APP_FEATURES) {
    try {
      const features = JSON.parse(process.env.REACT_APP_FEATURES);
      envConfig.features = features;
    } catch (e) {
      console.warn('Failed to parse REACT_APP_FEATURES');
    }
  }

  return Object.keys(envConfig).length > 0 ? envConfig : null;
}

/**
 * Load configuration from tenant-specific file
 * @private
 */
async function loadFromTenantFile(tenantId) {
  try {
    const response = await fetch(`/config/${tenantId}.json`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn(`Could not load tenant config for ${tenantId}:`, error);
  }
  return null;
}

/**
 * Initialize configuration system
 * @param {string} tenantId - Optional tenant identifier
 * @param {Object} customConfig - Optional custom configuration
 * @returns {Promise<Object>} Final configuration
 */
export async function initializeConfig(tenantId = null, customConfig = {}) {
  try {
    // Start with defaults
    let finalConfig = structuredClone(DEFAULT_CONFIG);

    // Override with tenant-specific config if available
    if (tenantId) {
      const tenantConfig = await loadFromTenantFile(tenantId);
      if (tenantConfig) {
        finalConfig = deepMerge(finalConfig, tenantConfig);
      }
    }

    // Override with environment variables
    const envConfig = loadFromEnv();
    if (envConfig) {
      finalConfig = deepMerge(finalConfig, envConfig);
    }

    // Override with runtime custom config
    if (customConfig && Object.keys(customConfig).length > 0) {
      finalConfig = deepMerge(finalConfig, customConfig);
    }

    // Load into manager and validate
    configManager.loadConfig(finalConfig);

    console.log('Configuration loaded successfully', {
      tenant: tenantId,
      hasCustomConfig: Object.keys(customConfig).length > 0,
      appName: configManager.get('branding.appName'),
    });

    return configManager.getAll();
  } catch (error) {
    console.error('Failed to initialize configuration:', error);
    configManager.reset();
    return configManager.getAll();
  }
}

/**
 * Deep merge utility
 * @private
 */
function deepMerge(target, source) {
  const output = structuredClone(target);

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        output[key] &&
        typeof output[key] === 'object'
      ) {
        output[key] = deepMerge(output[key], source[key]);
      } else {
        output[key] = source[key];
      }
    }
  }

  return output;
}

/**
 * Get current configuration value
 */
export function getConfig(path, defaultValue = null) {
  return configManager.get(path, defaultValue);
}

/**
 * Update configuration value at runtime
 */
export function setConfig(path, value) {
  return configManager.set(path, value);
}

/**
 * Get entire configuration
 */
export function getAllConfig() {
  return configManager.getAll();
}
