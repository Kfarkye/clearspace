import './vertex-ai-proxy-interceptor.js';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';

// --- Startup Environment Validation ---
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const proxyHeader = import.meta.env.VITE_PROXY_HEADER;

if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
  console.error('[ENV] CRITICAL: VITE_GOOGLE_CLIENT_ID is missing or using the default placeholder in .env.local. OAuth will not work.');
}
if (!proxyHeader) {
  console.error('[ENV] CRITICAL: VITE_PROXY_HEADER is missing from .env.local. Backend proxy calls will be rejected with 403.');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
