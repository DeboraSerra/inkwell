import "server-only";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;
// Next's data cache keeps successful (200) responses for a day, so retyping
// an ISBN or a query doesn't call the provider again.
const CACHE_SECONDS = 86_400;

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

// GETs JSON from a provider with a timeout and a size cap. Throws
// ProviderError on any failure. The URL is never put in the error, because
// Google's carries the API key.
export async function fetchProviderJson(
  provider: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "request failed";
    throw new ProviderError(provider, reason);
  }
  if (!response.ok) throw new ProviderError(provider, `status ${response.status}`);

  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) throw new ProviderError(provider, "response too large");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new ProviderError(provider, "response too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(provider, "invalid JSON");
  }
}
