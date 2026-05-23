/**
 * ThemeProvider - React context provider for dynamic theming
 * Applies branding configuration to the entire application
 */

import React, { createContext, useEffect, useMemo } from 'react';
import { useBranding } from '../hooks/useConfig';

export const ThemeContext = createContext({});

export function ThemeProvider({ children }) {
  const branding = useBranding();

  // Create CSS variables for dynamic theming
  useEffect(() => {
    const root = document.documentElement;

    // Set CSS custom properties
    root.style.setProperty('--color-primary', branding.primaryColor);
    root.style.setProperty('--color-secondary', branding.secondaryColor);
    root.style.setProperty('--color-accent', branding.accentColor);
    root.style.setProperty('--font-family', branding.fontFamily);
    root.style.setProperty('--border-radius', branding.borderRadius);

    // Update page title
    document.title = branding.appName;

    // Update favicon
    if (branding.favicon) {
      let favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = branding.favicon;
    }

    // Update app name in document
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', branding.primaryColor);
    }
  }, [branding]);

  const themeValue = useMemo(() => ({
    branding,
  }), [branding]);

  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to use theme context
 */
export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
