/**
 * ConfigManager - Central configuration management with validation
 * Handles merging, validation, and safe access to configurations
 */

import { DEFAULT_CONFIG } from './defaults.js';

class ConfigManager {
  constructor() {
    this.config = structuredClone(DEFAULT_CONFIG);
    this.validators = this._initializeValidators();
  }

  /**
   * Load custom configuration safely
   * @param {Object} customConfig - Custom configuration to merge
   * @returns {Object} Merged configuration
   */
  loadConfig(customConfig = {}) {
    try {
      const merged = this._deepMerge(this.config, customConfig);
      this._validateConfig(merged);
      this.config = merged;
      return this.config;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      console.warn('Falling back to default configuration');
      this.config = structuredClone(DEFAULT_CONFIG);
      return this.config;
    }
  }

  /**
   * Get configuration value with safe defaults
   * @param {string} path - Dot notation path (e.g., 'branding.primaryColor')
   * @param {*} defaultValue - Fallback value
   * @returns {*} Configuration value
   */
  get(path, defaultValue = null) {
    try {
      const keys = path.split('.');
      let value = this.config;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return defaultValue;
        }
      }

      return value ?? defaultValue;
    } catch (error) {
      console.warn(`Error accessing config path "${path}":`, error);
      return defaultValue;
    }
  }

  /**
   * Set configuration value with validation
   * @param {string} path - Dot notation path
   * @param {*} value - New value
   * @returns {boolean} Success status
   */
  set(path, value) {
    try {
      const keys = path.split('.');
      const lastKey = keys.pop();
      let target = this.config;

      // Navigate to parent object
      for (const key of keys) {
        if (!(key in target)) {
          target[key] = {};
        }
        target = target[key];
      }

      // Validate specific field if validator exists
      if (this.validators[lastKey]) {
        if (!this.validators[lastKey](value)) {
          throw new Error(`Invalid value for ${path}`);
        }
      }

      target[lastKey] = value;
      return true;
    } catch (error) {
      console.error(`Failed to set config ${path}:`, error);
      return false;
    }
  }

  /**
   * Get entire configuration object
   * @returns {Object} Current configuration
   */
  getAll() {
    return structuredClone(this.config);
  }

  /**
   * Reset to default configuration
   */
  reset() {
    this.config = structuredClone(DEFAULT_CONFIG);
  }

  /**
   * Deep merge two objects
   * @private
   */
  _deepMerge(target, source) {
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
          output[key] = this._deepMerge(output[key], source[key]);
        } else {
          output[key] = source[key];
        }
      }
    }

    return output;
  }

  /**
   * Validate configuration structure
   * @private
   */
  _validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    // Validate branding
    if (config.branding) {
      if (config.branding.primaryColor && !this._isValidColor(config.branding.primaryColor)) {
        throw new Error('Invalid primaryColor format');
      }
      if (config.branding.secondaryColor && !this._isValidColor(config.branding.secondaryColor)) {
        throw new Error('Invalid secondaryColor format');
      }
    }

    // Validate API settings
    if (config.api?.timeout && config.api.timeout < 0) {
      throw new Error('API timeout must be positive');
    }

    // Validate limits
    if (config.limits?.maxUploadSize && config.limits.maxUploadSize < 0) {
      throw new Error('Max upload size must be positive');
    }
  }

  /**
   * Initialize field validators
   * @private
   */
  _initializeValidators() {
    return {
      appName: (v) => typeof v === 'string' && v.length > 0,
      primaryColor: (v) => this._isValidColor(v),
      secondaryColor: (v) => this._isValidColor(v),
      accentColor: (v) => this._isValidColor(v),
      timeout: (v) => typeof v === 'number' && v > 0,
      maxUploadSize: (v) => typeof v === 'number' && v > 0,
    };
  }

  /**
   * Validate color format
   * @private
   */
  _isValidColor(color) {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    return hexRegex.test(color) || rgbRegex.test(color) || /^[a-z]+$/.test(color);
  }
}

// Export singleton instance
export const configManager = new ConfigManager();
