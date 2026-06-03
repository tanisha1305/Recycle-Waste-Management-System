import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent scroll wheel from changing number input values globally
document.addEventListener('wheel', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
    // Only prevent if the input is focused
    if (target === document.activeElement) {
      e.preventDefault();
    }
  }
}, { passive: false });

// Alternative: Blur number inputs when scrolling over them (even if not focused)
document.addEventListener('wheel', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
    (target as HTMLInputElement).blur();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
