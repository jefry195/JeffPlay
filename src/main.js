import { initUI } from './ui.js';

let deferredPrompt = null;

// Bootstrap application on content load
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  registerServiceWorker();
});

/**
 * Registers the Service Worker and handles custom PWA install promotions.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('ServiceWorker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.error('ServiceWorker registration failed:', err);
        });
    });
  }

  // Handle PWA installation prompts
  const installBtn = document.getElementById('pwa-install-btn');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default browser banner
    e.preventDefault();
    // Cache the event
    deferredPrompt = e;
    // Show PWA install button in top header
    if (installBtn) {
      installBtn.style.display = 'block';
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', () => {
      if (!deferredPrompt) return;
      
      // Trigger prompt
      deferredPrompt.prompt();
      
      // Handle response
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('PWA installation accepted by user.');
        } else {
          console.log('PWA installation declined.');
        }
        installBtn.style.display = 'none';
        deferredPrompt = null;
      });
    });
  }

  // Hide button if already installed
  window.addEventListener('appinstalled', () => {
    if (installBtn) {
      installBtn.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('JeffPlay successfully installed.');
  });
}
