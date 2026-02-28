import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MobileApp } from './MobileApp';
import { ToastProvider } from './components/Toast';
import { isMobileDevice } from './lib/deviceDetect';
import './index.css';

/**
 * Device-based root selection.
 *
 * Evaluated synchronously before React renders — no layout flash.
 * - Mobile / tablet (pointer: coarse, ≤1024px) → MobileApp (bottom TabBar navigation)
 * - Desktop                                     → App      (left Sidebar + overlays)
 *
 * Develop each independently: mobile features go in MobileApp.tsx and its
 * views; desktop features go in App.tsx and its panels.
 */
const Root = isMobileDevice() ? MobileApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>
);
