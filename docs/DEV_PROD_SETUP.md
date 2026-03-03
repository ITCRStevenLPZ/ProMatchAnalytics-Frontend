# Dev / Prod Environment Separation — Frontend Setup

> Full setup instructions (GCP, Firebase, GitHub Environments, DNS) are in the **Backend repo**: `docs/DEV_PROD_SETUP.md`

## What Changed in This Repo

### 1. `.github/workflows/deploy-firebase.yml`

- Triggers on **both** `main` and `dev` branches
- Uses a `resolve-env` job to map `main` → `production`, `dev` → `development`
- Jobs use **GitHub Environments** (`production` / `development`) for env-scoped secrets
- Deploys to the correct Firebase Hosting **target** (`prod` or `dev`)
- Supports `workflow_dispatch` with environment selection

### 2. `.github/workflows/pr-ci.yml`

- Now runs on PRs targeting **both** `main` and `dev`

### 3. `firebase.json`

- Converted from single hosting config to a **multi-site array** with targets `prod` and `dev`
- Both targets share the same SPA config (`dist/`, rewrite `** → /index.html`)

### 4. `.firebaserc` (new file)

- Maps Firebase hosting targets:
  - `prod` → `promatchanalytics` (existing site)
  - `dev` → `promatchanalytics-dev` (new site, must be created — see setup guide)

## Environment URLs

| Environment | URL                                 |
| ----------- | ----------------------------------- |
| Production  | `https://promatchanalytics.com`     |
| Development | `https://dev.promatchanalytics.com` |

## Key Difference Between Environments

The **only secret that differs** between environments is `VITE_API_URL`, which points to the respective Cloud Run backend:

- **Production**: `https://promatchanalytics-backend-<hash>-uc.a.run.app`
- **Development**: `https://promatchanalytics-backend-dev-<hash>-uc.a.run.app`

All Firebase config secrets (`VITE_FIREBASE_*`) remain the same since both environments share the same Firebase project.
