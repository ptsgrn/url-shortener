import { decodeIdToken, Google } from "arctic";
import { parseDomains } from "../policy.ts";
import type { ProviderFactory } from "./types.ts";

export const google: ProviderFactory = (env, redirectUri) => {
  const client = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  // Google's `hd` takes a single domain, so the first allowed one is sent and
  // the account chooser favours it. It's only a hint: `emailAllowed` still
  // checks the email against every allowed domain on the callback.
  const hd = parseDomains(env.ALLOWED_EMAIL_DOMAINS)[0];
  return {
    createAuthorizationURL(state, verifier) {
      const url = client.createAuthorizationURL(state, verifier, [
        "openid",
        "profile",
        "email",
      ]);
      if (hd) url.searchParams.set("hd", hd);
      return url;
    },
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
