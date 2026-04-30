function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function getDomainFromUrl(value = "") {
  try {
    const url = new URL(value);
    return normalizeDomain(url.hostname);
  } catch {
    return normalizeDomain(value);
  }
}

export function isDomainMatch(hostname = "", rule = "") {
  const normalizedHost = normalizeDomain(hostname);
  const normalizedRule = normalizeDomain(rule);

  if (!normalizedHost || !normalizedRule) {
    return false;
  }

  return normalizedHost === normalizedRule || normalizedHost.endsWith(`.${normalizedRule}`);
}

export function extractDomainsFromQuery(query = "") {
  const matches = String(query || "").match(/\bsite:([a-z0-9.-]+\.[a-z]{2,})\b/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => item.replace(/^site:/i, ""))
        .map((item) => normalizeDomain(item))
        .filter(Boolean)
    )
  );
}

export function evaluateDomainAccess({
  url,
  allowlist = [],
  blocklist = [],
  allowedDomainsOnly = [],
  requirePermissionForUnknownDomains = true,
  permissionCache = {}
} = {}) {
  const domain = getDomainFromUrl(url);
  const normalizedAllowlist = allowlist.map(normalizeDomain).filter(Boolean);
  const normalizedBlocklist = blocklist.map(normalizeDomain).filter(Boolean);
  const restrictedDomains = allowedDomainsOnly.map(normalizeDomain).filter(Boolean);

  if (!domain) {
    return {
      action: "blocked",
      reason: "invalid_domain",
      domain
    };
  }

  if (normalizedBlocklist.some((rule) => isDomainMatch(domain, rule))) {
    return {
      action: "blocked",
      reason: "blocklist",
      domain
    };
  }

  if (restrictedDomains.length && !restrictedDomains.some((rule) => isDomainMatch(domain, rule))) {
    return {
      action: "blocked",
      reason: "allowed_domains_only",
      domain
    };
  }

  if (normalizedAllowlist.some((rule) => isDomainMatch(domain, rule))) {
    return {
      action: "allow",
      reason: "allowlist",
      domain
    };
  }

  if (permissionCache[domain] === true || permissionCache[domain] === "allow") {
    return {
      action: "allow",
      reason: "permission_cache",
      domain
    };
  }

  if (permissionCache[domain] === false || permissionCache[domain] === "block" || permissionCache[domain] === "ignore") {
    return {
      action: "blocked",
      reason: "permission_cache_denied",
      domain
    };
  }

  if (requirePermissionForUnknownDomains) {
    return {
      action: "ask_permission",
      reason: "unknown_domain",
      domain
    };
  }

  return {
    action: "allow",
    reason: "default_allow",
    domain
  };
}
