// Convex auth configuration for the SentinelIQ enterprise tier.
//
// Wires an OIDC provider (Clerk) so `ctx.auth.getUserIdentity()` resolves in
// enterprise functions. Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment
// environment (Convex dashboard → Settings → Environment Variables) to your
// Clerk Frontend API URL, e.g. https://your-app.clerk.accounts.dev
//
// In Clerk, create a JWT template named "convex" (Convex looks for this
// application id by default). See https://docs.convex.dev/auth/clerk
//
// Until this is configured, authenticated functions throw "Not authenticated"
// — the code is correct, it just requires a signed-in identity.

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
