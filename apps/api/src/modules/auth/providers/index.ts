import { google } from "./google.ts";
import type { ProviderFactory } from "./types.ts";

export type { OAuthProfile, OAuthProvider } from "./types.ts";

/**
 * OAuth providers, keyed by the name used in `/api/v1/auth/:provider`.
 * To add one, create `./<name>.ts` on top of the matching `arctic` client
 * and register it here.
 */
export const providers: Record<string, ProviderFactory> = { google };
