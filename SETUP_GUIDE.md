# ProMatchAnalytics Frontend - Setup & Deployment Guide

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Phase 1: Local Development Setup](#phase-1-local-development-setup)
- [Phase 2: Firebase Setup](#phase-2-firebase-setup)
- [Phase 3: GitHub Configuration](#phase-3-github-configuration)
- [Phase 4: First Deployment](#phase-4-first-deployment)
- [Phase 5: Testing & Validation](#phase-5-testing--validation)
- [Ongoing Development](#ongoing-development)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm or yarn installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Pre-commit installed (`brew install pre-commit`)

### Required Access

- [ ] GitHub account with access to ITCRStevenLPZ/ProMatchAnalytics-Frontend
- [ ] Firebase project created (or will create in Phase 2)
- [ ] Backend API URL (from Backend deployment)

---

## Phase 1: Local Development Setup

### Step 1.1: Clone Repository

```bash
# Clone the repository
git clone https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend.git
cd ProMatchAnalytics-Frontend

# Verify you're on main branch
git branch
```

### Step 1.2: Install Dependencies

```bash
# Install all npm packages
npm install

# This will take a few minutes...
# Verify installation
npm list --depth=0
```

### Step 1.3: Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your values
nano .env
```

**Required Environment Variables:**

```env
# Backend API
VITE_API_URL=http://localhost:8000
# Will change to production URL after backend deployment

# Firebase Configuration
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Application Settings
VITE_APP_NAME=ProMatchAnalytics
VITE_APP_VERSION=1.0.0
```

### Step 1.4: Install Pre-commit Hooks

```bash
# Install pre-commit hooks
pre-commit install

# Test pre-commit hooks (may take a while first time)
pre-commit run --all-files
```

### Step 1.5: Start Development Server

```bash
# Start Vite development server
npm run dev

# Server should start at http://localhost:5173
```

### Step 1.6: Verify Application Loads

```bash
# Open browser to http://localhost:5173
# You should see the ProMatch login page

# Check console for any errors (F12 in browser)
```

**✅ Checkpoint:** Application loads without errors (Firebase errors are expected before configuration).

---

## Phase 2: Firebase Setup

### Step 2.1: Create Firebase Project

#### 2.1.1: Go to Firebase Console

```bash
# Open Firebase Console
open https://console.firebase.google.com
```

1. Click **"Add project"** or **"Create a project"**
2. Project name: `promatch-analytics` (or your preferred name)
3. Enable Google Analytics: **Optional** (recommended)
4. Choose Analytics account or create new
5. Click **"Create project"**

#### 2.1.2: Register Web App

1. In Firebase Console, click ⚙️ **Settings** → **Project settings**
2. Scroll to "Your apps" section
3. Click **Web** icon (`</>`)
4. Register app:

   - App nickname: `ProMatch Frontend`
   - ✅ Also set up Firebase Hosting
   - Click **"Register app"**

5. **Copy Firebase Configuration:**

```javascript
// You'll see something like this:
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "promatch-analytics.firebaseapp.com",
  projectId: "promatch-analytics",
  storageBucket: "promatch-analytics.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxx",
  measurementId: "G-XXXXXXXXXX",
};
```

6. **Save these values** - you'll need them for .env and GitHub secrets

### Step 2.2: Configure Firebase Authentication

#### 2.2.1: Enable Authentication Methods

```bash
# In Firebase Console:
# Navigate to: Build → Authentication → Get started
```

1. Click **"Get started"**
2. Click **"Sign-in method"** tab
3. Enable **Email/Password**:

   - Click on "Email/Password"
   - Toggle **Enable**
   - Click **"Save"**

4. **(Optional)** Enable Google Sign-in:
   - Click on "Google"
   - Toggle **Enable**
   - Select support email
   - Click **"Save"**

#### 2.2.2: Configure Authorized Domains

```bash
# In Firebase Console:
# Authentication → Settings → Authorized domains
```

1. `localhost` - Already added (for development)
2. Add your production domain later (after deployment)
3. Firebase Hosting domain is automatically authorized

### Step 2.3: Set Up Firebase Hosting

#### 2.3.1: Install Firebase CLI

```bash
# Install globally
npm install -g firebase-tools

# Verify installation
firebase --version

# Login to Firebase
firebase login

# This will open browser for authentication
```

#### 2.3.2: Initialize Firebase in Project

```bash
# Make sure you're in the Frontend directory
cd ProMatchAnalytics-Frontend

# Initialize Firebase
firebase init

# Select features:
# ◉ Hosting: Configure files for Firebase Hosting
# (Space to select, Enter to confirm)

# Select project:
# ❯ Use an existing project
# Select your promatch-analytics project

# Hosting setup:
# What do you want to use as your public directory? dist
# Configure as a single-page app? Yes
# Set up automatic builds with GitHub? No (we'll use GitHub Actions)
# File dist/index.html already exists. Overwrite? No
```

#### 2.3.3: Test Firebase Hosting Locally

```bash
# Build the app
npm run build

# Preview with Firebase
firebase serve

# Or use emulators
firebase emulators:start --only hosting

# Visit http://localhost:5000
```

### Step 2.4: Get Firebase Token for CI/CD

```bash
# Generate CI token for GitHub Actions
firebase login:ci

# This will open browser for authentication
# Copy the token that appears in terminal
# Save this token - you'll need it for GitHub secrets
```

**Example output:**

```
✔  Success! Use this token to login on a CI server:

1//XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

Example: firebase deploy --token "$FIREBASE_TOKEN"
```

### Step 2.5: Get Service Account Key

#### 2.5.1: Create Service Account

```bash
# Go to Firebase Console
# Project Settings → Service accounts → Generate new private key
```

1. Click **"Generate new private key"**
2. Click **"Generate key"** in dialog
3. Save the JSON file securely
4. **DO NOT** commit this file to git

#### 2.5.2: Format Service Account for GitHub Secret

```bash
# The JSON file content will be used as FIREBASE_SERVICE_ACCOUNT secret
# You can minify it to single line:
cat path/to/service-account-key.json | jq -c '.'

# Or just copy the entire content as-is
```

---

## Phase 3: GitHub Configuration

### Step 3.1: Update Environment Variables

```bash
# Update .env with your Firebase config
nano .env
```

Paste your Firebase values:

```env
VITE_API_URL=https://your-backend-url.run.app
# Get this from Backend Cloud Run deployment

VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=promatch-analytics.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=promatch-analytics
VITE_FIREBASE_STORAGE_BUCKET=promatch-analytics.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:xxxxxxxxxxxxx
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Step 3.2: Add GitHub Secrets

Navigate to: <https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend/settings/secrets/actions>

Click **"New repository secret"** for each of the following:

#### 3.2.1: Backend API Secret

```
Secret Name: VITE_API_URL
Value: https://your-backend-service-xxxxx.run.app
(Get from Backend Cloud Run deployment)
```

#### 3.2.2: Firebase Configuration Secrets

```
Secret Name: VITE_FIREBASE_API_KEY
Value: AIzaSyXXXXXXXXXXXXXXXX
```

```
Secret Name: VITE_FIREBASE_AUTH_DOMAIN
Value: promatch-analytics.firebaseapp.com
```

```
Secret Name: VITE_FIREBASE_PROJECT_ID
Value: promatch-analytics
```

```
Secret Name: VITE_FIREBASE_STORAGE_BUCKET
Value: promatch-analytics.appspot.com
```

```
Secret Name: VITE_FIREBASE_MESSAGING_SENDER_ID
Value: 123456789012
```

```
Secret Name: VITE_FIREBASE_APP_ID
Value: 1:123456789012:web:xxxxxxxxxxxxx
```

```
Secret Name: VITE_FIREBASE_MEASUREMENT_ID
Value: G-XXXXXXXXXX
```

#### 3.2.3: Firebase Deployment Secrets

```
Secret Name: FIREBASE_TOKEN
Value: 1//XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
(Token from: firebase login:ci)
```

```
Secret Name: FIREBASE_SERVICE_ACCOUNT
Value: {
  "type": "service_account",
  "project_id": "promatch-analytics",
  ...entire JSON content...
}
(Content of service account JSON file)
```

### Step 3.3: Configure Branch Protection

Navigate to: <https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend/settings/branches>

1. Click **"Add rule"**
2. Branch name pattern: `main`
3. Enable these settings:
   - ✅ Require a pull request before merging
   - ✅ Require approvals (at least 1)
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
4. Click **"Create"**

### Step 3.4: Verify GitHub Actions Workflow

```bash
# Check workflow file exists
ls -la .github/workflows/

# Expected output: deploy-firebase.yml

# Review workflow configuration
cat .github/workflows/deploy-firebase.yml
```

---

## Phase 4: First Deployment

### Step 4.1: Test Build Locally

```bash
# Create production build
npm run build

# This creates a dist/ directory
ls -la dist/

# Preview production build locally
npm run preview
# Visit http://localhost:4173
```

### Step 4.2: Test Firebase Connection Locally

```bash
# Update .env with real Firebase values
# Restart dev server
npm run dev

# Try to log in or register
# Check browser console for Firebase connection
# Should see successful authentication attempts
```

### Step 4.3: Create Feature Branch for Testing

```bash
# Create a feature branch
git checkout -b feature/test-deployment

# Make a small change (e.g., update README)
echo "\n## Deployment Test" >> README.md

# Commit and push
git add README.md
git commit -m "test: Verify deployment pipeline"
git push origin feature/test-deployment
```

### Step 4.4: Create Pull Request

1. Go to: <https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend/pulls>
2. Click **"New pull request"**
3. Base: `main` ← Compare: `feature/test-deployment`
4. Click **"Create pull request"**
5. **Wait for checks to complete**
6. **Look for preview URL** in PR comments (Firebase preview channel)

### Step 4.5: Test Preview Deployment

```bash
# GitHub Actions will comment on PR with preview URL
# Example: https://promatch-analytics--pr123-xxxxx.web.app

# Visit the preview URL
# Test the application
# Verify Firebase authentication works
# Test API connection to backend
```

### Step 4.6: Deploy to Production

```bash
# Merge PR to main (via GitHub UI) or:
git checkout main
git merge feature/test-deployment
git push origin main

# This triggers production deployment
```

### Step 4.7: Monitor Deployment

```bash
# Watch GitHub Actions
# Go to: https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend/actions

# Or check Firebase Hosting
firebase hosting:channel:list

# View deployed site
firebase hosting:channel:open live
```

### Step 4.8: Get Production URL

```bash
# Your production URL will be:
# https://promatch-analytics.web.app
# or
# https://promatch-analytics.firebaseapp.com

# Test production deployment
open https://promatch-analytics.web.app
```

**✅ Checkpoint:** Application loads from Firebase Hosting and can connect to backend API.

---

## Phase 5: Testing & Validation

### Step 5.1: Test User Authentication

```bash
# Visit your deployed site
open https://promatch-analytics.web.app

# Test registration:
# 1. Click "Sign Up" or "Register"
# 2. Enter email and password
# 3. Verify account created in Firebase Console
# 4. Check email verification (if enabled)

# Test login:
# 1. Enter credentials
# 2. Verify successful login
# 3. Check JWT token in localStorage (DevTools)
```

### Step 5.2: Test API Integration

```bash
# Open browser DevTools (F12)
# Network tab → Filter: Fetch/XHR
# Perform actions that call backend API
# Verify requests to backend URL
# Check response status codes (should be 200)
```

### Step 5.3: Test PWA Features (if enabled)

```bash
# Open site in Chrome
# DevTools → Application tab
# Check:
# - Service Worker registered
# - Cache Storage populated
# - Offline functionality

# Test offline:
# DevTools → Network tab → Offline
# Refresh page - should still work (cached)
```

### Step 5.4: Test Internationalization

```bash
# If i18n is configured
# Test language switching:
# 1. Look for language selector
# 2. Switch between English/Spanish
# 3. Verify translations load correctly
# 4. Check localStorage for language preference
```

### Step 5.5: Monitor Firebase Usage

```bash
# Go to Firebase Console
# Check these sections:

# 1. Authentication → Users
#    Verify test users are created

# 2. Hosting
#    Check deployment history
#    View bandwidth usage

# 3. Analytics (if enabled)
#    View page views
#    Check user engagement
```

### Step 5.6: Check Performance

```bash
# Run Lighthouse audit
# Chrome DevTools → Lighthouse tab
# Select: Performance, Accessibility, Best Practices, SEO
# Click "Generate report"

# Target scores:
# - Performance: 90+
# - Accessibility: 90+
# - Best Practices: 90+
# - SEO: 90+
```

---

## Ongoing Development

### Daily Development Workflow

```bash
# 1. Pull latest changes
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Install any new dependencies
npm install

# 4. Start dev server
npm run dev

# 5. Make changes and test locally
# Visit http://localhost:5173

# 6. Run pre-commit checks
pre-commit run --all-files

# 7. Build and test
npm run build
npm run preview

# 8. Commit and push
git add .
git commit -m "feat: Your feature description"
git push origin feature/your-feature-name

# 9. Create PR on GitHub
# 10. Test preview deployment
# 11. Merge after approval
```

### Adding New Dependencies

```bash
# Add production dependency
npm install package-name

# Add development dependency
npm install --save-dev package-name

# Update all dependencies
npm update

# Check for outdated packages
npm outdated

# Commit package changes
git add package.json package-lock.json
git commit -m "chore: Add/update dependencies"
```

### Component Development

```bash
# Create new component
mkdir -p src/components/NewComponent
touch src/components/NewComponent/NewComponent.tsx
touch src/components/NewComponent/index.ts

# Component template:
cat > src/components/NewComponent/NewComponent.tsx << 'EOF'
import React from 'react';

interface NewComponentProps {
  // Define props
}

export const NewComponent: React.FC<NewComponentProps> = (props) => {
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};
EOF

# Export component
echo "export { NewComponent } from './NewComponent';" > src/components/NewComponent/index.ts
```

### Testing

```bash
# Run tests (when test suite is added)
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# View coverage report
open coverage/index.html
```

### Building for Production

```bash
# Create optimized production build
npm run build

# Analyze bundle size
npm run build -- --stats

# Preview production build locally
npm run preview

# Deploy manually (if needed)
firebase deploy --only hosting
```

---

## Documentation

For more detailed information, please refer to the following documents:

- [Logger Cockpit Guide](docs/logger_cockpit.md): Comprehensive guide to the rapid data entry interface and keyboard shortcuts.
- [State Management & Offline Sync](docs/state_management.md): Explanation of Zustand stores and IndexedDB synchronization logic.
- [Match Event Updates](frontend_match_event_updates.md): Details on event data structure changes.

## Troubleshooting

### Issue: Firebase Authentication Not Working

**Symptoms:** "Firebase: Error (auth/...)" in console

**Solutions:**

1. Verify Firebase config in .env matches Firebase Console
2. Check authorized domains in Firebase Console
3. Verify authentication methods are enabled
4. Clear browser cache and localStorage
5. Check browser console for specific error codes

```bash
# Test Firebase connection
# In browser console:
firebase.auth().currentUser
firebase.auth().onAuthStateChanged(user => console.log(user))
```

### Issue: Cannot Connect to Backend API

**Symptoms:** Network errors, CORS errors, API requests fail

**Solutions:**

```bash
# 1. Verify backend URL is correct
echo $VITE_API_URL

# 2. Check backend CORS configuration
# Backend should allow frontend origin

# 3. Test backend directly
curl https://your-backend-url.run.app/health

# 4. Check browser Network tab for actual error
# DevTools → Network → Failed request → Response
```

### Issue: Vite cache errors after dependency patching

**Symptoms:** Vite dev server crashes, React Flow fails to render, or d3 module export errors after `npm install`.

**Solutions:**

```bash
# Re-apply the d3 patch (postinstall also runs this)
node scripts/patch-d3-modules.mjs

# Clear Vite pre-bundle cache
rm -rf node_modules/.vite/deps*

# Restart the dev server
npm run dev
```

### Issue: Build Fails

**Symptoms:** `npm run build` throws errors

**Solutions:**

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite

# Check for TypeScript errors
npm run type-check

# Fix linting errors
npm run lint -- --fix

# Build with detailed output
npm run build -- --debug
```

### Issue: Firebase Deploy Fails

**Symptoms:** `firebase deploy` fails or GitHub Action fails

**Solutions:**

```bash
# Re-authenticate
firebase login

# Check project
firebase projects:list
firebase use promatch-analytics

# Verify hosting target
firebase target:apply hosting main promatch-analytics

# Test deployment locally
firebase serve

# Check Firebase token is valid
firebase login:ci

# Redeploy manually
firebase deploy --only hosting
```

### Issue: Preview URLs Not Working

**Symptoms:** PR doesn't get preview URL comment

**Solutions:**

1. Check GitHub Actions logs for errors
2. Verify FIREBASE_SERVICE_ACCOUNT secret is correct JSON
3. Check Firebase Hosting quota limits
4. Verify workflow has correct permissions

```bash
# List channels
firebase hosting:channel:list

# Create channel manually
firebase hosting:channel:deploy preview-test

# Clean up old channels
firebase hosting:channel:delete preview-old
```

### Issue: Hot Reload Not Working

**Symptoms:** Changes don't appear automatically

**Solutions:**

```bash
# Restart dev server
# Ctrl+C then npm run dev

# Clear Vite cache
rm -rf node_modules/.vite

# Check file watcher limits (macOS)
echo "kern.maxfiles=65536" | sudo tee -a /etc/sysctl.conf
echo "kern.maxfilesperproc=65536" | sudo tee -a /etc/sysctl.conf
```

### Issue: Environment Variables Not Loading

**Symptoms:** `import.meta.env.VITE_XXX` is undefined

**Solutions:**

```bash
# 1. Verify .env file exists
ls -la .env

# 2. Check variable names start with VITE_
grep VITE_ .env

# 3. Restart dev server (required after .env changes)
# Ctrl+C then npm run dev

# 4. Check build process
npm run build
grep -r "VITE_API_URL" dist/
```

---

## Quick Reference Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint

# Fix linting issues
npm run lint -- --fix

# Run type checking
npm run type-check

# Run pre-commit checks
pre-commit run --all-files

# Firebase commands
firebase login
firebase deploy
firebase hosting:channel:list
firebase serve

# Update dependencies
npm update
npm audit fix

# Clear cache and reinstall
rm -rf node_modules package-lock.json && npm install
```

---

## Next Steps

- [ ] Complete Phase 1-5 in this guide
- [ ] Configure custom domain for Firebase Hosting
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Add comprehensive test suite (Vitest, Testing Library)
- [ ] Configure Firebase Analytics events
- [ ] Set up performance monitoring
- [ ] Add E2E tests (Playwright, Cypress)
- [ ] Optimize bundle size and code splitting
- [ ] Implement PWA features (service worker, offline mode)
- [ ] Set up staging environment with preview channels

**🎉 Once complete, your frontend will be fully deployed on Firebase Hosting with automatic preview deployments!**
