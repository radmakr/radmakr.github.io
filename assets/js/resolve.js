// Resolves an AT Protocol handle the way an app does: a DNS TXT record names the
// DID, the DID document names the PDS, and the PDS describes the repo. Everything
// that touches the network goes through `resolveHandle`; the rest are pure
// functions so the tests can feed them recorded responses.

export class ResolveError extends Error {
  constructor(step, message, options) {
    super(message, options);
    this.name = "ResolveError";
    this.step = step;
  }
}

// MARK: - Handles

const handlePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHandle(input) {
  const handle = String(input ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!handlePattern.test(handle)) {
    throw new ResolveError("dns", `“${input}” isn’t a valid handle.`);
  }
  return handle;
}

// MARK: - Endpoints

export function dnsURL(handle) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", `_atproto.${handle}`);
  url.searchParams.set("type", "TXT");
  return url.href;
}

export function didDocumentURL(did) {
  if (did.startsWith("did:plc:")) return `https://plc.directory/${did}`;
  if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length));
    return `https://${host}/.well-known/did.json`;
  }
  throw new ResolveError("did", `${did} uses a DID method this page can’t resolve.`);
}

export function describeRepoURL(pds, did) {
  const url = new URL("/xrpc/com.atproto.repo.describeRepo", pds);
  url.searchParams.set("repo", did);
  return url.href;
}

// MARK: - Parsing

const txtRecordType = 16;

// DNS-over-HTTPS returns TXT data as one or more quoted strings.
function txtValue(data) {
  const parts = [...String(data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, part]) =>
    part.replace(/\\(.)/g, "$1"),
  );
  return parts.length > 0 ? parts.join("") : String(data);
}

export function didFromDnsAnswer(answer, handle) {
  if (answer?.Status === 3) {
    throw new ResolveError("dns", `There’s no _atproto record for ${handle}.`);
  }
  if (answer?.Status !== 0) {
    throw new ResolveError("dns", `The DNS lookup for ${handle} failed.`);
  }

  const dids = (answer.Answer ?? [])
    .filter((record) => record.type === txtRecordType)
    .map((record) => txtValue(record.data))
    .filter((value) => value.startsWith("did="))
    .map((value) => value.slice("did=".length));

  if (dids.length === 0) {
    throw new ResolveError("dns", `${handle} has no did= record.`);
  }
  if (dids.length > 1) {
    throw new ResolveError("dns", `${handle} has more than one did= record.`);
  }

  const [did] = dids;
  if (!/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(did)) {
    throw new ResolveError("dns", `“${did}” isn’t a DID.`);
  }
  return did;
}

export function pdsFromDidDocument(document, did, handle) {
  if (document?.id !== did) {
    throw new ResolveError("did", "The DID document describes a different DID.");
  }

  const handleMatches = (document.alsoKnownAs ?? []).some(
    (alias) => String(alias).toLowerCase() === `at://${handle}`,
  );
  const service = (document.service ?? []).find(
    (entry) =>
      String(entry.id).endsWith("#atproto_pds") && entry.type === "AtprotoPersonalDataServer",
  );

  let endpoint;
  try {
    endpoint = new URL(service?.serviceEndpoint);
  } catch {
    endpoint = undefined;
  }
  if (endpoint?.protocol !== "https:") {
    throw new ResolveError("did", "The DID document doesn’t name a PDS.");
  }
  return { pds: endpoint.origin, handleMatches };
}

// MARK: - Collections

// Collections are NSIDs, so the reversed domain at the front says which app
// wrote them. Apps without a friendly name here show up as that domain.
const knownApps = [
  { name: "Bluesky", url: "https://bsky.app", authorities: ["app.bsky", "chat.bsky"] },
  { name: "Tangled", url: "https://tangled.org", authorities: ["sh.tangled", "org.tangled"] },
  { name: "Effem", url: "https://effem.xyz", authorities: ["xyz.effem"], mine: true },
  { name: "Avocadough", url: "https://avocadough.xyz", authorities: ["xyz.avocadough"], mine: true },
  { name: "Germ", url: "https://www.germnetwork.com", authorities: ["com.germnetwork"] },
];

export function appForCollection(nsid) {
  const known = knownApps.find((app) =>
    app.authorities.some((authority) => String(nsid).startsWith(`${authority}.`)),
  );
  if (known) return known;

  const [tld = "", domain = ""] = String(nsid).split(".");
  return { name: `${domain}.${tld}`, authorities: [`${tld}.${domain}`] };
}

export function groupCollections(collections) {
  const groups = new Map();
  for (const nsid of collections) {
    const app = appForCollection(nsid);
    const group = groups.get(app.name) ?? {
      name: app.name,
      url: app.url,
      mine: app.mine === true,
      collections: [],
    };
    group.collections.push(nsid);
    groups.set(app.name, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.collections.length - a.collections.length || a.name.localeCompare(b.name),
  );
}

// MARK: - Resolving

export async function resolveHandle(input, options = {}) {
  const {
    fetch = (...args) => globalThis.fetch(...args),
    now = () => performance.now(),
    timeout = 8000,
    onStep = () => {},
  } = options;

  const handle = normalizeHandle(input);
  const started = now();

  async function step(id, url, init, read) {
    onStep({ id, state: "pending" });
    const stepStarted = now();
    const host = new URL(url).host;

    try {
      let response;
      try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
      } catch (cause) {
        throw new ResolveError(id, `Couldn’t reach ${host}.`, { cause });
      }
      if (!response.ok) {
        throw new ResolveError(id, `${host} answered ${response.status}.`);
      }

      let body;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ResolveError(id, `${host} didn’t send JSON.`, { cause });
      }

      const value = read(body);
      onStep({ id, state: "done", ms: Math.round(now() - stepStarted), value });
      return value;
    } catch (error) {
      const failure =
        error instanceof ResolveError ? error : new ResolveError(id, error.message, { cause: error });
      onStep({ id, state: "error", error: failure });
      throw failure;
    }
  }

  const did = await step(
    "dns",
    dnsURL(handle),
    { headers: { accept: "application/dns-json" } },
    (answer) => didFromDnsAnswer(answer, handle),
  );

  const { pds, handleMatches } = await step("did", didDocumentURL(did), {}, (document) =>
    pdsFromDidDocument(document, did, handle),
  );

  const repo = await step("repo", describeRepoURL(pds, did), {}, (description) => {
    const collections = description.collections ?? [];
    return {
      handle: description.handle,
      handleIsCorrect:
        description.handleIsCorrect === true && String(description.handle).toLowerCase() === handle,
      count: collections.length,
      apps: groupCollections(collections),
    };
  });

  return { handle, did, pds, handleMatches, repo, ms: Math.round(now() - started) };
}
