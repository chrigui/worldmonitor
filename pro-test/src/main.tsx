import {StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import App, { renderTurnstileWidgets } from './App.tsx';
import { initI18n } from './i18n';
import { convexClient, CLERK_PUBLISHABLE_KEY, LIVE_MODE } from './dashboard/live/convexClient';
import './index.css';

/**
 * In live mode, wrap the app in Clerk + Convex providers so the dashboard's
 * useQuery/useMutation calls are authenticated. In demo mode (no env), render
 * the app untouched — no auth dependency, nothing to configure.
 */
function withProviders(children: ReactNode): ReactNode {
  if (LIVE_MODE && convexClient && CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    );
  }
  return children;
}

const TURNSTILE_SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';

initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {withProviders(<App />)}
    </StrictMode>,
  );

  // Render widgets once React has mounted and the async Turnstile script is ready.
  const initWidgets = () => {
    if (!window.turnstile) return false;
    return renderTurnstileWidgets() > 0;
  };

  const turnstileScript = document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR);
  turnstileScript?.addEventListener('load', () => {
    initWidgets();
  }, { once: true });

  if (!initWidgets()) {
    let attempts = 0;
    const retryInterval = window.setInterval(() => {
      if (initWidgets() || ++attempts >= 20) window.clearInterval(retryInterval);
    }, 500);
  }

  // Re-render Turnstile widgets when navigating between pages (hash routing).
  // Retry a few times since React needs to mount the new page's .cf-turnstile divs.
  window.addEventListener('hashchange', () => {
    let tries = 0;
    const poll = () => {
      if (initWidgets() || ++tries >= 10) return;
      setTimeout(poll, 200);
    };
    setTimeout(poll, 100);
  });
});
