/** Resolve DeepSeek's standalone Search/Fetch routes without duplicating /v1/tools. */
export function deepseekToolEndpoint(
  baseUrl: string | undefined,
  operation: "search" | "fetch"
): string {
  let url: URL;
  try {
    url = new URL(baseUrl || "https://api.deepseek.com");
  } catch {
    throw new Error("Invalid DeepSeek web endpoint");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("DeepSeek web endpoint must be an HTTP(S) URL without credentials");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/(?:search|fetch)$/, "");
  const root = path.endsWith("/v1/tools")
    ? path
    : path.endsWith("/v1")
      ? `${path}/tools`
      : `${path}/v1/tools`;
  url.pathname = `${root}/${operation}`;
  url.hash = "";
  return url.toString();
}
