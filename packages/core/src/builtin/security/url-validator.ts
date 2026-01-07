import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * IPv4 private/reserved ranges to block
 * @see RFC 1918, RFC 5735, RFC 6598
 */
type IPv4PrefixRange = { type: "prefix"; prefix: string; mask: number };
type IPv4StartEndRange = { type: "range"; start: string; end: string };
type IPv4ExactMatch = { type: "exact"; exact: string };
type IPv4Range = IPv4PrefixRange | IPv4StartEndRange | IPv4ExactMatch;

const IPV4_PRIVATE_RANGES: IPv4Range[] = [
  // RFC 1918 - Private Use
  { type: "prefix", prefix: "10.", mask: 8 },
  { type: "range", start: "172.16.0.0", end: "172.31.255.255" },
  { type: "prefix", prefix: "192.168.", mask: 16 },
  // Loopback
  { type: "prefix", prefix: "127.", mask: 8 },
  // Link-local
  { type: "prefix", prefix: "169.254.", mask: 16 },
  // CGNAT (Carrier-grade NAT)
  { type: "prefix", prefix: "100.64.", mask: 10 },
  // Reserved for documentation
  { type: "prefix", prefix: "192.0.2.", mask: 24 },
  { type: "prefix", prefix: "198.51.100.", mask: 24 },
  { type: "prefix", prefix: "203.0.113.", mask: 24 },
  // Broadcast
  { type: "exact", exact: "255.255.255.255" },
  // Current network
  { type: "prefix", prefix: "0.", mask: 8 },
];

/**
 * IPv6 private/reserved prefixes to block
 */
const IPV6_PRIVATE_PREFIXES = [
  "::1", // Loopback
  "fc", // Unique local (fc00::/7)
  "fd", // Unique local (fd00::/8)
  "fe80:", // Link-local
  "::ffff:127.", // IPv4-mapped loopback
  "::ffff:10.", // IPv4-mapped private
  "::ffff:172.16.",
  "::ffff:172.17.",
  "::ffff:172.18.",
  "::ffff:172.19.",
  "::ffff:172.20.",
  "::ffff:172.21.",
  "::ffff:172.22.",
  "::ffff:172.23.",
  "::ffff:172.24.",
  "::ffff:172.25.",
  "::ffff:172.26.",
  "::ffff:172.27.",
  "::ffff:172.28.",
  "::ffff:172.29.",
  "::ffff:172.30.",
  "::ffff:172.31.",
  "::ffff:192.168.",
  "::ffff:169.254.",
  "::", // Unspecified
];

/**
 * Parse IPv4 address to numeric value for range comparison
 */
function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);
  const p0 = parts[0] ?? 0;
  const p1 = parts[1] ?? 0;
  const p2 = parts[2] ?? 0;
  const p3 = parts[3] ?? 0;
  return ((p0 << 24) | (p1 << 16) | (p2 << 8) | p3) >>> 0;
}

/**
 * Check if an IPv4 address is in a given range
 */
function isInRange(ip: string, start: string, end: string): boolean {
  const ipNum = ipv4ToNumber(ip);
  const startNum = ipv4ToNumber(start);
  const endNum = ipv4ToNumber(end);
  return ipNum >= startNum && ipNum <= endNum;
}

/**
 * Check if an IP address is private/reserved
 *
 * @param ip - IP address string (IPv4 or IPv6)
 * @returns true if the IP is private/reserved and should be blocked
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: IP range checking requires comprehensive CIDR validation
export function isPrivateIP(ip: string): boolean {
  if (!ip) return false;

  const version = isIP(ip);
  if (version === 0) {
    // Not a valid IP - could be decimal encoded or other obfuscation
    return false;
  }

  const normalizedIP = ip.toLowerCase();

  if (version === 4) {
    // Check all IPv4 ranges
    for (const range of IPV4_PRIVATE_RANGES) {
      switch (range.type) {
        case "exact":
          if (ip === range.exact) return true;
          break;
        case "prefix":
          if (ip.startsWith(range.prefix)) return true;
          break;
        case "range":
          if (isInRange(ip, range.start, range.end)) return true;
          break;
      }
    }
    return false;
  }

  if (version === 6) {
    // Check IPv6 private prefixes
    for (const prefix of IPV6_PRIVATE_PREFIXES) {
      if (normalizedIP.startsWith(prefix.toLowerCase())) {
        return true;
      }
    }

    // Check for full loopback
    if (normalizedIP === "::1" || normalizedIP === "0:0:0:0:0:0:0:1") {
      return true;
    }

    return false;
  }

  return false;
}

/**
 * Check if IP is the unspecified address (0.0.0.0 or ::)
 */
export function isUnspecifiedIP(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "0:0:0:0:0:0:0:0";
}

/**
 * Normalize an IP address that may be obfuscated
 * Handles decimal encoding, octal, hex, and other tricks
 *
 * @param ip - Potentially obfuscated IP string
 * @returns Normalized IP string or null if not a valid IP
 */
export function normalizeIP(ip: string): string | null {
  // Handle decimal-encoded IP (e.g., 2130706433 = 127.0.0.1)
  const decimalMatch = /^(\d+)$/.exec(ip);
  if (decimalMatch?.[1]) {
    const num = parseInt(decimalMatch[1], 10);
    if (num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }

  // Handle octal-encoded IP (e.g., 0177.0.0.1 = 127.0.0.1)
  const octalMatch = /^(0[0-7]*)\.([0-7]+)\.([0-7]+)\.([0-7]+)$/.exec(ip);
  if (octalMatch) {
    const parts = octalMatch.slice(1).map((p) => parseInt(p, 8));
    if (parts.every((p) => p >= 0 && p <= 255)) {
      return parts.join(".");
    }
  }

  // Handle hex-encoded IP (e.g., 0x7f.0x0.0x0.0x1 = 127.0.0.1)
  const hexMatch = /^(0x[0-9a-f]+)\.(0x[0-9a-f]+)\.(0x[0-9a-f]+)\.(0x[0-9a-f]+)$/i.exec(ip);
  if (hexMatch) {
    const parts = hexMatch.slice(1).map((p) => parseInt(p, 16));
    if (parts.every((p) => p >= 0 && p <= 255)) {
      return parts.join(".");
    }
  }

  // Already a valid IP, return as-is
  if (isIP(ip) !== 0) {
    return ip;
  }

  return null;
}

/**
 * Result of URL validation with DNS
 */
export interface UrlValidationResult {
  valid: boolean;
  url: URL;
  resolvedIPs: string[];
  error?: string;
}

/**
 * Validate a URL with full SSRF protection including DNS resolution
 *
 * @param urlString - URL to validate
 * @param options - Validation options
 * @returns Validation result with resolved IPs
 */
export async function validateUrlWithDNS(
  urlString: string,
  options: {
    allowPrivateIPs?: boolean;
    timeout?: number;
  } = {}
): Promise<UrlValidationResult> {
  const { allowPrivateIPs = false, timeout = 5000 } = options;

  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return {
      valid: false,
      url: null as unknown as URL,
      resolvedIPs: [],
      error: `Invalid URL: ${urlString}`,
    };
  }

  // Only allow http and https
  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      valid: false,
      url,
      resolvedIPs: [],
      error: `Invalid protocol: ${url.protocol}`,
    };
  }

  const hostname = url.hostname;

  // Check if hostname is already an IP
  const normalizedIP = normalizeIP(hostname);
  if (normalizedIP) {
    if (!allowPrivateIPs && isPrivateIP(normalizedIP)) {
      return {
        valid: false,
        url,
        resolvedIPs: [normalizedIP],
        error: `Private IP blocked: ${normalizedIP}`,
      };
    }
    return {
      valid: true,
      url,
      resolvedIPs: [normalizedIP],
    };
  }

  // Resolve DNS with timeout
  const resolvedIPs: string[] = [];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const result = await lookup(hostname, { all: true });
    clearTimeout(timeoutId);

    for (const record of result) {
      resolvedIPs.push(record.address);
    }
  } catch (err) {
    const error = err as Error;
    return {
      valid: false,
      url,
      resolvedIPs: [],
      error: `DNS resolution failed: ${error.message}`,
    };
  }

  // Check all resolved IPs
  if (!allowPrivateIPs) {
    for (const ip of resolvedIPs) {
      if (isPrivateIP(ip)) {
        return {
          valid: false,
          url,
          resolvedIPs,
          error: `DNS rebinding detected: ${hostname} resolved to private IP ${ip}`,
        };
      }
    }
  }

  return {
    valid: true,
    url,
    resolvedIPs,
  };
}

/**
 * Cloud metadata endpoint patterns
 * These endpoints expose sensitive instance credentials
 */
const CLOUD_METADATA_ENDPOINTS = [
  // AWS
  { ip: "169.254.169.254", provider: "AWS" },
  { hostname: "instance-data", provider: "AWS" },
  // GCP
  { hostname: "metadata.google.internal", provider: "GCP" },
  { hostname: "metadata.goog", provider: "GCP" },
  { ip: "169.254.169.254", provider: "GCP" }, // GCP also uses this
  // Azure
  { ip: "169.254.169.254", provider: "Azure" },
  { hostname: "169.254.169.254", provider: "Azure" },
  // Azure IMDS special IP
  { ip: "168.63.129.16", provider: "Azure" },
  // Alibaba Cloud
  { ip: "100.100.100.200", provider: "Alibaba" },
  // DigitalOcean
  { ip: "169.254.169.254", provider: "DigitalOcean" },
  // Oracle Cloud
  { ip: "169.254.169.254", provider: "Oracle" },
  // Kubernetes
  { hostname: "kubernetes.default", provider: "Kubernetes" },
  { hostname: "kubernetes.default.svc", provider: "Kubernetes" },
];

/**
 * Result of cloud metadata check
 */
export interface CloudMetadataCheckResult {
  isMetadata: boolean;
  provider?: string;
  reason?: string;
}

/**
 * Check if a URL points to a cloud metadata endpoint
 *
 * @param url - URL to check (can be string or URL object)
 * @returns Check result with provider info if blocked
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Cloud provider metadata detection requires comprehensive pattern matching
export function isCloudMetadata(url: string | URL): CloudMetadataCheckResult {
  let parsed: URL;
  try {
    parsed = typeof url === "string" ? new URL(url) : url;
  } catch {
    return { isMetadata: false };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check known metadata IPs
  const normalizedIP = normalizeIP(hostname);
  if (normalizedIP) {
    for (const endpoint of CLOUD_METADATA_ENDPOINTS) {
      if ("ip" in endpoint && normalizedIP === endpoint.ip) {
        return {
          isMetadata: true,
          provider: endpoint.provider,
          reason: `Cloud metadata IP detected: ${normalizedIP}`,
        };
      }
    }
  }

  // Check known metadata hostnames
  for (const endpoint of CLOUD_METADATA_ENDPOINTS) {
    if ("hostname" in endpoint && endpoint.hostname) {
      const pattern = endpoint.hostname.toLowerCase();
      if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
        return {
          isMetadata: true,
          provider: endpoint.provider,
          reason: `Cloud metadata hostname detected: ${hostname}`,
        };
      }
    }
  }

  // Check for metadata paths (common patterns)
  const path = parsed.pathname.toLowerCase();
  if (
    path.includes("/latest/meta-data") ||
    path.includes("/metadata/instance") ||
    path.includes("/computemetadata/v1")
  ) {
    // Only flag if also hitting a metadata IP
    if (
      normalizedIP &&
      ["169.254.169.254", "168.63.129.16", "100.100.100.200"].includes(normalizedIP)
    ) {
      return {
        isMetadata: true,
        provider: "Unknown",
        reason: `Cloud metadata path pattern detected: ${path}`,
      };
    }
  }

  return { isMetadata: false };
}
