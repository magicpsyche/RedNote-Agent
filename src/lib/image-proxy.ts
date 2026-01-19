const PROXY_PATH = "/api/proxy-image";

/**
 * Wrap remote image URLs with the local proxy to avoid CORS pollution during canvas export.
 * Non-http URLs and already proxied/relative paths are returned as-is.
 */
export function toProxyImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith(PROXY_PATH)) return url;
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return url;
    return `${PROXY_PATH}?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return url;
  }
}

export { PROXY_PATH as IMAGE_PROXY_PATH };
