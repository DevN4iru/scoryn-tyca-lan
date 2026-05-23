/**
 * Configuration Loader - Loads config from multiple sources
 * Priority: Vite Environment > Tenant File > Defaults
 */

import { configManager } from './ConfigManager.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Load configuration from Vite environment variables.
 * Vite exposes browser env values through import.meta.env, not process.env.
 * @private
 */
function loadFromEnv() {
  const env = import.meta.env || {};
  const envConfig = {};

  // Branding from environment
  if (env.VITE_APP_NAME) {
    envConfig.branding = { ...(envConfig.branding || {}), appName: env.VITE_APP_NAME };
  }
  if (env.VITE_APP_PRIMARY_COLOR) {
    envConfig.branding = { ...(envConfig.branding || {}), primaryColor: env.VITE_APP_PRIMARY_COLOR };
  }
  if (env.VITE_APP_SECONDARY_COLOR) {
    envConfig.branding = { ...(envConfig.branding || {}), secondaryColor: env.VITE_APP_SECONDARY_COLOR };
  }
  if (env.VITE_APP_ACCENT_COLOR) {
    envConfig.branding = { ...(envConfig.branding || {}), accentColor: env.VITE_APP_ACCENT_COLOR };
  }
  if (env.VITE_APP_API_URL) {
    envConfig.api = { ...(envConfig.api || {}), baseURL: env.VITE_APP_API_URL };
  }

  // Backward-compatible support for old REACT_APP_* values when injected manually.
  // This is intentionally guarded so it cannot crash in the browser.
  if (typeof process !== 'undefined' && process.env) {
    const legacy = process.env;
    if (legacy.REACT_APP_NAME) {
      envConfig.branding = { ...(envConfig.branding || {}), appName: legacy.REACT_APP_NAME };
    }
    if (legacy.REACT_APP_PRIMARY_COLOR) {
      envConfig.branding = { ...(envConfig.branding || {}), primaryColor: legacy.REACT_APP_PRIMARY_COLOR };
    }
    if (legacy.REACT_APP_SECONDARY_COLOR) {
      envConfig.branding = { ...(envConfig.branding || {}), secondaryColor: legacy.REACT_APP_SECONDARY_COLOR };
    }
    if (legacy.REACT_APP_ACCENT_COLOR) {
      envConfig.branding = { ...(envConfig.branding || {}), accentColor: legacy.REACT_APP_ACCENT_COLOR };
    }
    if (legacy.REACT_APP_API_URL) {
      envConfig.api = { ...(envConfig.api || {}), baseURL: legacy.REACT_APP_API_URL };
    }
    if (legacy.REACT_APP_FEATURES) {
      try {
        envConfig.features = JSON.parse(legacy.REACT_APP_FEATURES);
      } catch {
        console.warn('Failed to parse REACT_APP_FEATURES');
      }
    }
  }

  if (env.VITE_APP_FEATURES) {
    try {
      envConfig.features = JSON.parse(env.VITE_APP_FEATURES);
    } catch {
      console.warn('Failed to parse VITE_APP_FEATURES');
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
    let finalConfig = structuredClone(DEFAULT_CONFIG);

    if (tenantId) {
      const tenantConfig = await loadFromTenantFile(tenantId);
      if (tenantConfig) {
        finalConfig = deepMerge(finalConfig, tenantConfig);
      }
    }

    const envConfig = loadFromEnv();
    if (envConfig) {
      finalConfig = deepMerge(finalConfig, envConfig);
    }

    if (customConfig && Object.keys(customConfig).length > 0) {
      finalConfig = deepMerge(finalConfig, customConfig);
    }

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
    if (Object.prototype.hasOwnProperty.call(source, key)) {
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
