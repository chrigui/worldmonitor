import { ConvexReactClient } from 'convex/react';

// Live-mode configuration, read from Vite env. When VITE_CONVEX_URL is unset the
// dashboard runs on interactive demo data instead (see Dashboard.tsx).
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/** True when both Convex and Clerk are configured for live mode. */
export const LIVE_MODE = Boolean(CONVEX_URL && CLERK_PUBLISHABLE_KEY);

/** Singleton Convex client, created only when a deployment URL is present. */
export const convexClient = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;
