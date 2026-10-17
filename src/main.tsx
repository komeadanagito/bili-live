import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OverlayApp from './OverlayApp';
import './styles.css';

const isOverlay = window.location.hash.includes('overlay') || window.location.pathname.includes('overlay');

if (isOverlay) {
  document.documentElement.classList.add('is-overlay-window');
  document.body.classList.add('is-overlay-window');
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.backgroundColor = 'transparent';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayApp /> : <App />}
  </React.StrictMode>
);
