export function consumeCapabilityFragment(name = "token"): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get(name);
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return token;
}
