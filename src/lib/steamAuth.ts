// Steam login is OpenID 2.0, not OAuth2 — no client secret, no token
// exchange. The browser is redirected to Steam, Steam redirects it back
// with openid.* query params, and we must re-verify those params directly
// with Steam (openid.mode=check_authentication) before trusting them.
// Skipping that verification would let anyone forge a login as any SteamID
// simply by crafting the callback query string themselves.

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID_PATTERN = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

export function getLoginRedirectUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

// Returns the verified SteamID64, or null if the callback params are
// missing, malformed, or Steam rejects the verification.
export async function verifySteamCallback(query: Record<string, string | undefined>): Promise<string | null> {
  if (query["openid.mode"] !== "id_res") return null;

  const claimedId = query["openid.claimed_id"];
  if (!claimedId) return null;

  const match = CLAIMED_ID_PATTERN.exec(claimedId);
  if (!match) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && value !== undefined) {
      params.set(key, value);
    }
  }
  params.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) return null;

  const body = await response.text();
  const isValid = /is_valid\s*:\s*true/.test(body);
  if (!isValid) return null;

  return match[1] as string;
}
