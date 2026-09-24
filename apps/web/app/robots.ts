import type { MetadataRoute } from "next";

/**
 * Indexing is opt-in. Staging and preview deployments run the same build as
 * production, and a staging copy that gets indexed competes with the real site
 * for the same queries. Only the deployment with NEXT_PUBLIC_ALLOW_INDEXING=true
 * invites crawlers.
 *
 * /passport is deliberately not disallowed here: it already answers with
 * X-Robots-Tag noindex (next.config.ts), and a crawler that is disallowed never
 * fetches the page, so it never sees the noindex and can still list the URL.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_ALLOW_INDEXING !== "true") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  // Read directly rather than through getPublicEnv: this file is prerendered at
  // build time, and must not require the Supabase keys to exist there.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/dashboard", "/practice", "/onboarding", "/security"]
    },
    sitemap: new URL("/sitemap.xml", origin).toString()
  };
}
