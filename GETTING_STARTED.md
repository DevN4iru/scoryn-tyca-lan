# 🚀 Scoryn SaaS - Getting Started Guide

Your application is now a **production-ready, highly customizable SaaS platform** that won't break when you customize it!

## ⚡ Quick Start (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:5173` - your app is live!

---

## 🎯 What You Now Have

### ✅ Safe Configuration System
- **No breaking changes** - Invalid config values fall back to defaults
- **Multi-source loading** - Environment vars override tenant config override defaults
- **Real-time updates** - Change config at runtime without restarting
- **Full validation** - All values are validated before use

### ✅ Dynamic Theming
- **CSS Custom Properties** - All colors/fonts/spacing are customizable via variables
- **No hard-coded values** - Every style uses a CSS variable with safe fallback
- **Dark mode ready** - Built-in dark mode support with automatic detection
- **Instant updates** - Theme changes apply immediately across the entire app

### ✅ React Hooks for Configuration
```javascript
import { useBranding, useFeature, useConfig } from '@/hooks/useConfig';

function MyComponent() {
  const { appName, primaryColor } = useBranding();
  const analyticsEnabled = useFeature('analytics');
  const [customValue, setCustomValue] = useConfig('myKey');
  
  return <h1 style={{ color: primaryColor }}>{appName}</h1>;
}
```

### ✅ Smart API Client
- **Automatic retries** with exponential backoff
- **Request/response interceptors** for middleware
- **Error handling** with fallback strategies
- **Type-safe** configuration

### ✅ Multi-Tenant Ready
- Support unlimited tenants with separate configs
- Tenant ID-based configuration loading
- Isolated branding per tenant
- Easy deployment scaling

---

## 🔧 3 Ways to Customize

### Method 1: Environment Variables (Easiest)
Perfect for **deployment-specific settings** (API URLs, feature flags, colors).

```bash
# .env
REACT_APP_NAME="My SaaS App"
REACT_APP_PRIMARY_COLOR="#3b82f6"
REACT_APP_API_URL="https://api.myapp.com"
REACT_APP_FEATURES={"analytics":true,"darkMode":false}
```

**Pros**: Easy to manage in CI/CD, no code changes needed
**Cons**: Limited to flat key-value structure

---

### Method 2: Tenant Config Files (Recommended)
Perfect for **multi-tenant deployments** where each customer has their own branding.

Create `public/config/{tenantId}.json`:
```json
{
  "branding": {
    "appName": "Acme Corp",
    "primaryColor": "#ff6b6b",
    "logo": "/logos/acme.png"
  },
  "features": {
    "analytics": true,
    "premiumFeatures": true
  }
}
```

Load it in your app:
```javascript
const tenantId = window.location.hostname.split('.')[0]; // acme.myapp.com
await initializeConfig(tenantId);
```

**Pros**: Clean separation, easy to update without redeploy
**Cons**: Requires tenant identification logic

---

### Method 3: Runtime Configuration (Most Flexible)
Perfect for **dynamic settings** that change during app usage.

```javascript
import { setConfig } from '@/config/loadConfig';
import { useBranding } from '@/hooks/useConfig';

function SettingsPanel() {
  const handleColorChange = (newColor) => {
    // Changes apply instantly across entire app!
    setConfig('branding.primaryColor', newColor);
  };

  return <ColorPicker onChange={handleColorChange} />;
}
```

**Pros**: Most flexible, real-time updates
**Cons**: Changes are lost on page refresh (save to backend if needed)

---

## 📁 Project Structure

```
src/
├── config/
│   ├── defaults.js          # Default configuration
│   ├── ConfigManager.js     # Configuration validation & access
│   └── loadConfig.js        # Multi-source configuration loading
├── api/
│   └── ApiClient.js         # HTTP client with retries & interceptors
├── hooks/
│   └── useConfig.js         # React hooks for configuration
├── components/
│   └── ThemeProvider.jsx    # Dynamic theme CSS variable injection
├── styles/
│   └── theme.css            # All CSS uses custom properties
└── main.jsx                 # Application entry point

public/
└── config/
    ├── example.json         # Example tenant configuration
    └── {tenantId}.json      # Tenant-specific configs (create as needed)
```

---

## 🎨 Customization Examples

### Change App Colors
```javascript
// Option 1: Environment variables
REACT_APP_PRIMARY_COLOR="#6366f1"

// Option 2: Tenant config file
{ "branding": { "primaryColor": "#6366f1" } }

// Option 3: Runtime
setConfig('branding.primaryColor', '#6366f1');
```

### Toggle Features
```javascript
// Use in components
const analyticsEnabled = useFeature('analytics');

if (analyticsEnabled) {
  <Analytics />;
}

// Change at runtime
setConfig('features.analytics', false);
```

### Use Custom API Endpoint
```javascript
// Environment variable
REACT_APP_API_URL="https://api.production.com"

// Tenant config
{ "api": { "baseURL": "https://api.acme.com" } }
```

### Customize Typography
```javascript
setConfig('branding.fontFamily', 'Georgia, serif');
setConfig('branding.borderRadius', '0.75rem');
```

---

## 🛡️ Safety Guarantees

### Your App Won't Break Because:

1. **Validation** - Invalid config values rejected + warning logged
2. **Fallbacks** - All CSS uses variables with safe defaults
3. **Deep Merge** - Partial configs merged, not replaced
4. **Error Handling** - Failed config loads fall back to defaults
5. **Type Checking** - Config values validated against expected types

### Example Safe Customization
```javascript
// ❌ Bad color format - falls back to default
setConfig('branding.primaryColor', 'not-a-color');

// ✅ Valid color - applies immediately
setConfig('branding.primaryColor', '#3b82f6');

// ❌ Invalid feature flag - still works with false default
setConfig('features.unknown', 'value');

// ✅ Valid feature flag - works perfectly
setConfig('features.analytics', true);
```

---

## 🚀 Deployment Strategies

### Single Tenant Deployment
```bash
# Build with environment variables
npm run build

# Deploy to server
NODE_ENV=production npm start
```

### Multi-Tenant on Subdomains
```javascript
// Load tenant based on subdomain
const tenantId = window.location.hostname.split('.')[0];
await initializeConfig(tenantId);
```

Deploy same build to all subdomains - each gets own config!

### Multi-Tenant on Paths
```javascript
// Load tenant based on URL path
const tenantId = window.location.pathname.split('/')[1];
await initializeConfig(tenantId);
```

Example URLs:
- `https://myapp.com/acme/` → uses `/config/acme.json`
- `https://myapp.com/globex/` → uses `/config/globex.json`

---

## 🔌 Adding Custom Configuration

### Step 1: Add Default Value
```javascript
// src/config/defaults.js
export const DEFAULT_CONFIG = {
  // ... existing config
  customFeature: {
    enabled: true,
    timeout: 5000,
  }
};
```

### Step 2: Use in Component
```javascript
import { useConfig } from '@/hooks/useConfig';

function MyComponent() {
  const [enabled, setEnabled] = useConfig('customFeature.enabled');
  const [timeout] = useConfig('customFeature.timeout');
  
  return <div>Enabled: {enabled}, Timeout: {timeout}ms</div>;
}
```

### Step 3: Override via Config File
```json
{
  "customFeature": {
    "enabled": false,
    "timeout": 10000
  }
}
```

---

## 📊 API Integration

### Basic Request
```javascript
import { apiClient } from '@/api/ApiClient';

async function fetchUsers() {
  try {
    const users = await apiClient.get('/users');
    console.log(users);
  } catch (error) {
    console.error('Failed:', error.message);
  }
}
```

### With Error Handling
```javascript
// API Client automatically:
// ✅ Retries failed requests
// ✅ Uses exponential backoff
// ✅ Times out after configured duration
// ✅ Validates responses
// ✅ Runs interceptors
```

### Add Custom Interceptors
```javascript
// Add authentication
apiClient.addRequestInterceptor(async (config) => {
  const token = localStorage.getItem('token');
  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Log responses
apiClient.addResponseInterceptor(async (data) => {
  console.log('API Response:', data);
  return data;
});

// Track errors
apiClient.addErrorInterceptor(async (error) => {
  console.error('API Error:', error);
  // Send to error tracking service
});
```

---

## 🎓 Best Practices

### ✅ DO
- Use `useConfig()` hooks instead of importing config directly
- Put secrets in environment variables, never in config files
- Validate user input before passing to config
- Use feature flags for gradual rollouts
- Store persisted config in backend database

### ❌ DON'T
- Hard-code colors, URLs, or feature flags in components
- Assume config will never change
- Store sensitive data in localStorage
- Use synchronous config access in async operations
- Deploy without testing configuration changes

---

## 🐛 Troubleshooting

### Colors Not Updating?
```javascript
// Check that ThemeProvider wraps your app
<ThemeProvider>
  <App />
</ThemeProvider>

// Verify color format is valid
setConfig('branding.primaryColor', '#3b82f6'); // ✅
setConfig('branding.primaryColor', 'rgb(59, 130, 246)'); // ✅
setConfig('branding.primaryColor', 'blue'); // ✅
setConfig('branding.primaryColor', 'not-valid'); // ❌
```

### Config Not Loading?
```javascript
// Check browser console for errors
console.log(getConfig('branding.appName'));

// Verify file exists
// public/config/tenantId.json should exist

// Check JSON syntax
// Use JSON validator if unsure
```

### API Calls Failing?
```javascript
// Verify API URL is correct
console.log(getConfig('api.baseURL'));

// Check CORS is enabled on backend
// Check network tab in DevTools

// Verify authentication token exists
console.log(localStorage.getItem('token'));
```

### Features Not Working?
```javascript
// Check feature flag is enabled
console.log(getConfig('features.analytics'));

// Verify component checks before rendering
const analyticsEnabled = useFeature('analytics');
if (analyticsEnabled) return <Analytics />;
```

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `src/config/defaults.js` | Default configuration for all features |
| `src/config/ConfigManager.js` | Validates and manages configuration |
| `src/config/loadConfig.js` | Loads config from multiple sources |
| `src/hooks/useConfig.js` | React hooks for accessing config |
| `src/api/ApiClient.js` | HTTP client with retry logic |
| `src/components/ThemeProvider.jsx` | Injects CSS variables dynamically |
| `src/styles/theme.css` | All styles using CSS custom properties |
| `public/config/{tenantId}.json` | Tenant-specific configuration |
| `.env` | Environment variables |

---

## 🎉 You're Ready!

Your SaaS application is now:

✅ **Highly Customizable** - Change anything without breaking  
✅ **Production Ready** - Error handling, retries, validation built-in  
✅ **Multi-Tenant Capable** - Support unlimited tenants  
✅ **Themeable** - Dynamic colors, fonts, spacing  
✅ **Easy to Deploy** - Environment-based configuration  
✅ **Developer Friendly** - React hooks, clean API, good docs  

### Next Steps
1. **Customize branding** - Update colors, fonts, app name
2. **Add API integration** - Connect to your backend
3. **Toggle features** - Enable/disable functionality per tenant
4. **Deploy with confidence** - Your config won't break the app

---

**Version**: 1.0.0 SaaS Edition  
**Last Updated**: 2026-05-23  
**Status**: ✅ Production Ready

For detailed documentation, see `README_SAAS.md`
