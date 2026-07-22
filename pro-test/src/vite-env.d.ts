/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex deployment URL, e.g. https://your-app.convex.cloud (live mode). */
  readonly VITE_CONVEX_URL?: string;
  /** Clerk publishable key, pk_test_… / pk_live_… (live mode). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
