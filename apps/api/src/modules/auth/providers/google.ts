import { decodeIdToken, Google } from "arctic";
import type { ProviderFactory } from "./types.ts";

export const google: ProviderFactory = (env, redirectUri) => {
  const client = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  return {
    createAuthorizationURL: (state, verifier) =>
      client.createAuthorizationURL(state, verifier, [
        "openid",
        "profile",
        "email",
      ]),
    async getProfile(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier);
      const claims = decodeIdToken(tokens.idToken()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      return {
        id: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true,
        name: claims.name,
        avatarUrl: claims.picture,
      };
    },
  };
};
