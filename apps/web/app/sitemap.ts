import type { MetadataRoute } from "next";

/**
 * Only the pages meant to rank. A new public page belongs here when it is
 * published; seo/brief.md says which pages those are.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Read directly rather than through getPublicEnv: this file is prerendered at
  // build time, and must not require the Supabase keys to exist there.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [{ url: new URL("/", origin).toString() }];
}
