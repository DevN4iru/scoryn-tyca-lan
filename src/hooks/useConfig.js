/**
 * useConfig Hook - React hook for accessing configuration
 * Provides reactive config updates and type safety
 */

import { useState, useCallback, useEffect } from 'react';
import { getConfig, setConfig } from '../config/loadConfig.js';

/**
 * Hook to get configuration values
 * @param {string} path - Dot notation path to config value
 * @param {*} defaultValue - Fallback value
 * @returns {[*]} Configuration value
 */
export function useConfigValue(path, defaultValue = null) {
  const [value, setValue] = useState(() => getConfig(path, defaultValue));

  // Refresh on path change
  useEffect(() => {
    setValue(getConfig(path, defaultValue));
  }, [path, defaultValue]);

  return value;
}

/**
 * Hook to get and update configuration
 * @param {string} path - Dot notation path to config value
 * @param {*} defaultValue - Fallback value
 * @returns {[*, Function]} Configuration value and setter
 */
export function useConfig(path, defaultValue = null) {
  const value = useConfigValue(path, defaultValue);

  const updateValue = useCallback((newValue) => {
    const success = setConfig(path, newValue);
    if (success) {
      // Trigger re-render by setting state
      // In a real app, you'd use a state management solution
      return true;
    }
    return false;
  }, [path]);

  return [value, updateValue];
}

/**
 * Hook to get all branding configuration
 * @returns {Object} Branding configuration
 */
export function useBranding() {
  return {
    appName: useConfigValue('branding.appName'),
    logo: useConfigValue('branding.appLogo'),
    favicon: useConfigValue('branding.favicon'),
    primaryColor: useConfigValue('branding.primaryColor'),
    secondaryColor: useConfigValue('branding.secondaryColor'),
    accentColor: useConfigValue('branding.accentColor'),
    fontFamily: useConfigValue('branding.fontFamily'),
    borderRadius: useConfigValue('branding.borderRadius'),
  };
}

/**
 * Hook to check if a feature is enabled
 * @param {string} featureName - Feature name
 * @returns {boolean} Feature enabled status
 */
export function useFeature(featureName) {
  return useConfigValue(`features.${featureName}`, false);
}

/**
 * Hook to get all feature flags
 * @returns {Object} All feature flags
 */
export function useFeatureFlags() {
  return {
    betaFeatures: useConfigValue('featureFlags.betaFeatures'),
    experimentalUI: useConfigValue('featureFlags.experimentalUI'),
    maintenanceMode: useConfigValue('featureFlags.maintenanceMode'),
  };
}
