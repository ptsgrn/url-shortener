import type { OAuthProfile } from "./providers/index.ts";

/** `ALLOWED_EMAIL_DOMAINS` (`a.example, B.example`) → `["a.example", "b.example"]`. */
export const parseDomains = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

/**
 * FR-01: who may sign in. With no domains configured, anyone the provider
 * signs in. Otherwise the provider must have verified the email, and its
 * domain must be one of `domains` exactly (subdomains aren't included:
 * list them separately).
 */
export const emailAllowed = (
  { email, emailVerified }: Pick<OAuthProfile, "email" | "emailVerified">,
  domains: string[],
): boolean => {
  if (domains.length === 0) return true;
  if (!email || emailVerified !== true) return false;
  const at = email.lastIndexOf("@");
  return at > 0 && domains.includes(email.slice(at + 1).toLowerCase());
};
