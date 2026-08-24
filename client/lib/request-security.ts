const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isTrustedMutationRequest(input: {
  method: string;
  requestOrigin: string;
  originHeader: string | null;
  fetchSite: string | null;
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (!input.originHeader || input.originHeader !== input.requestOrigin) return false;
  return input.fetchSite === null || input.fetchSite === "same-origin";
}

export function safeSameOriginRedirect(
  location: string,
  requestOrigin: string,
): string | null {
  try {
    const target = new URL(location, requestOrigin);
    return target.origin === requestOrigin ? target.toString() : null;
  } catch {
    return null;
  }
}
