# ProMatchAnalytics Frontend

React + TypeScript frontend application for real-time soccer match logging and analytics.

## 🚀 Features

- **Real-time Match Logging** via WebSocket
- **Offline-First Architecture** with IndexedDB
- **Firebase Authentication** integration
- **Responsive Design** with Tailwind CSS
- **Internationalization** (i18n) support
- **Role-Based UI** (Admin, Logger, Viewer)
- **Progressive Web App** (PWA) ready
- **TypeScript** for type safety

## 📋 Requirements

- Node.js 18+ 
- npm or yarn
- Firebase project credentials
- Backend API running

## 🛠️ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Frontend.git
cd ProMatchAnalytics-Frontend
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Configure Environment

Create `.env` file in the root:

```env
# Backend API
VITE_API_URL=http://localhost:8000

# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 4. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Application will be available at: http://localhost:5173

### 5. Build for Production

```bash
npm run build
# or
yarn build
```

Output will be in `dist/` directory.

## 📁 Project Structure

```
ProMatchAnalytics-Frontend/
├── public/                  # Static assets
│   └── locales/            # Translation files
│       ├── en/
│       └── es/
├── src/
│   ├── components/         # Reusable components
│   │   ├── Layout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── OfflineIndicator.tsx
│   ├── pages/              # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Teams.tsx
│   │   ├── Matches.tsx
│   │   ├── LoggerCockpit.tsx
│   │   └── ...
│   ├── store/              # Zustand state management
│   │   ├── authStore.ts
│   │   ├── syncStore.ts
│   │   └── useMatchLogStore.ts
│   ├── hooks/              # Custom React hooks
│   │   ├── useMatchSocket.ts
│   │   └── ...
│   ├── lib/                # Utility libraries
│   │   ├── firebase.ts
│   │   ├── db.ts          # IndexedDB (Dexie)
│   │   └── api.ts         # API client
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   ├── i18n.ts             # i18n configuration
│   ├── App.tsx             # Main app component
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles
├── .env.example            # Environment variables template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── vite.config.ts          # Vite configuration
└── README.md               # This file
```

## 🎨 Available Scripts

```bash
# Development
npm run dev              # Start dev server with HMR

# Build
npm run build            # Production build
npm run preview          # Preview production build locally

# Type Checking
npm run type-check       # Run TypeScript compiler check

# Linting (if configured)
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues

# Testing (if configured)
npm run test             # Run tests
npm run test:coverage    # Run tests with coverage
```

## 🌐 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API URL | Yes | - |
| `VITE_FIREBASE_API_KEY` | Firebase API key | Yes | - |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes | - |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Yes | - |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Yes | - |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Yes | - |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Yes | - |

## 🔌 Key Technologies

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **Zustand** - State management
- **React Query** - Server state management
- **Dexie** - IndexedDB wrapper
- **i18next** - Internationalization
- **Lucide React** - Icons
- **Firebase** - Authentication

## 🎯 Features

### Authentication
- Firebase email/password authentication
- Protected routes based on user roles
- Persistent authentication state

### Offline Support
- IndexedDB for local data storage
- Automatic sync when back online
- Queue for offline operations
- Visual indicators for connection status

### Real-time Updates
- WebSocket connection for live match data
- Automatic reconnection handling
- Real-time event streaming

### Internationalization
- Support for multiple languages (EN, ES)
- Language switcher
- RTL support ready

### Responsive Design
- Mobile-first approach
- Tablet and desktop optimized
- Touch-friendly UI for match logging

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repository to Vercel dashboard.

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod
```

### Firebase Hosting

```bash
# Build the app
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
# Build and run
docker build -t promatch-frontend .
docker run -p 80:80 promatch-frontend
```

### Static Hosting

Build and upload `dist/` folder to:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- GitHub Pages

## ⚙️ Configuration

### API URL

Update API URL in `.env`:
```env
VITE_API_URL=https://your-backend-api.com
```

### Firebase

Get Firebase config from Firebase Console → Project Settings → General → Your apps

### Tailwind CSS

Customize in `tailwind.config.js`:
```js
export default {
  theme: {
    extend: {
      colors: {
        primary: {...},
        // Your custom colors
      },
    },
  },
}
```

### Routing

Add new routes in `src/App.tsx`:
```tsx
<Route path="/new-page" element={<NewPage />} />
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## 📱 PWA Features

- **Offline functionality**: App works without internet
- **Install prompt**: Add to home screen
- **Push notifications**: Real-time updates (if configured)
- **Background sync**: Sync data when online

## 🎨 Theming

The app uses Tailwind CSS with custom color scheme:

- **Primary**: Blue (#2563eb)
- **Success**: Green (#10b981)
- **Warning**: Yellow (#f59e0b)
- **Error**: Red (#ef4444)

Customize in `tailwind.config.js` and `src/index.css`.

## 🌍 Adding New Languages

1. Create translation file in `public/locales/{lang}/translation.json`
2. Add language to `src/i18n.ts`:
```ts
resources: {
  en: { translation: enTranslation },
  es: { translation: esTranslation },
  fr: { translation: frTranslation }, // New
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📝 Code Style

- Use TypeScript for all new code
- Follow ESLint configuration
- Use functional components with hooks
- Write meaningful component and variable names
- Add comments for complex logic

## 🔗 Related Repositories

- **Backend**: [ProMatchAnalytics-Backend](https://github.com/ITCRStevenLPZ/ProMatchAnalytics-Backend)

## 📖 Documentation

- **TypeScript Fix Guide**: [TYPESCRIPT_FIX_GUIDE.md](./TYPESCRIPT_FIX_GUIDE.md)

## 🐛 Common Issues

### Port already in use
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

### Build fails
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript errors
```bash
# Restart TS server in VS Code
Cmd+Shift+P → "TypeScript: Restart TS Server"
```

## 📧 Support

For issues and questions, open an issue on GitHub.

## 📄 License

This project is licensed under the MIT License.
