import type { AuthEnv } from "../../../utils/deps.ts";

export interface OAuthProfile {
  /** The user's id at the provider. */
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface OAuthProvider {
  createAuthorizationURL(state: string, codeVerifier: string): URL;
  getProfile(code: string, codeVerifier: string): Promise<OAuthProfile>;
}

export type ProviderFactory = (
  env: AuthEnv,
  redirectUri: string,
) => OAuthProvider;
