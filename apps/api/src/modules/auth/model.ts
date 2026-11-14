import { t, type UnwrapSchema } from "elysia";

const message = <M extends string>(m: M) => t.Object({ message: t.Literal(m) });

const invalidOAuthState = message("Invalid OAuth state");
const oauthExchangeFailed = message("OAuth code exchange failed");

export const AuthModel = {
  providerParams: t.Object({ provider: t.String() }),
  signInQuery: t.Object({ redirectTo: t.Optional(t.String()) }),
  callbackQuery: t.Object({
    code: t.Optional(t.String()),
    state: t.Optional(t.String()),
  }),
  ok: t.Object({ ok: t.Literal(true) }),
  unauthorized: message("Unauthorized"),
  invalidRefreshToken: message("Invalid refresh token"),
  unknownProvider: message("Unknown provider"),
  invalidOAuthState,
  oauthExchangeFailed,
  signInFailed: t.Union([invalidOAuthState, oauthExchangeFailed]),
} as const;

export type AuthModel = {
  [k in keyof typeof AuthModel]: UnwrapSchema<(typeof AuthModel)[k]>;
};
