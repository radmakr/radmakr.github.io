import { describe, expect, test } from "bun:test";
import {
  ResolveError,
  appForCollection,
  describeRepoURL,
  didDocumentURL,
  didFromDnsAnswer,
  dnsURL,
  groupCollections,
  normalizeHandle,
  pdsFromDidDocument,
  resolveHandle,
} from "../assets/js/resolve.js";
import dnsAnswer from "./fixtures/dns.json";
import didDocument from "./fixtures/did.json";
import repoDescription from "./fixtures/describe-repo.json";

const handle = "radmakr.com";
const did = "did:plc:aq5iwu4gjdcg2hq53llism3x";
const pds = "https://inkcap.us-east.host.bsky.network";

function failure(run: () => unknown): ResolveError {
  try {
    run();
  } catch (error) {
    if (error instanceof ResolveError) return error;
    throw error;
  }
  throw new Error("Expected a ResolveError");
}

describe("normalizeHandle", () => {
  test("strips the @ and lowercases", () => {
    expect(normalizeHandle("@RadMakr.com")).toBe(handle);
    expect(normalizeHandle("  radmakr.com ")).toBe(handle);
  });

  test("rejects things that aren't domains", () => {
    for (const input of ["", "radmakr", "radmakr..com", "-radmakr.com", "radmakr.com/x", "radmakr.123"]) {
      expect(failure(() => normalizeHandle(input)).step).toBe("dns");
    }
  });
});

describe("endpoints", () => {
  test("ask Cloudflare for the _atproto TXT record", () => {
    const url = new URL(dnsURL(handle));
    expect(url.origin).toBe("https://cloudflare-dns.com");
    expect(url.searchParams.get("name")).toBe("_atproto.radmakr.com");
    expect(url.searchParams.get("type")).toBe("TXT");
  });

  test("find DID documents for did:plc and did:web", () => {
    expect(didDocumentURL(did)).toBe(`https://plc.directory/${did}`);
    expect(didDocumentURL("did:web:example.com")).toBe("https://example.com/.well-known/did.json");
    expect(didDocumentURL("did:web:localhost%3A8080")).toBe("https://localhost:8080/.well-known/did.json");
    expect(failure(() => didDocumentURL("did:key:z6Mk")).step).toBe("did");
  });

  test("describe the repo on the PDS", () => {
    const url = new URL(describeRepoURL(pds, did));
    expect(url.origin).toBe(pds);
    expect(url.pathname).toBe("/xrpc/com.atproto.repo.describeRepo");
    expect(url.searchParams.get("repo")).toBe(did);
  });
});

describe("didFromDnsAnswer", () => {
  test("reads the DID from the recorded answer", () => {
    expect(didFromDnsAnswer(dnsAnswer, handle)).toBe(did);
  });

  test("joins TXT records that arrive split into quoted strings", () => {
    const answer = { Status: 0, Answer: [{ type: 16, data: `"did=did:plc:aq5iwu4g" "jdcg2hq53llism3x"` }] };
    expect(didFromDnsAnswer(answer, handle)).toBe(did);
  });

  test("ignores TXT records that aren't did=", () => {
    const answer = {
      Status: 0,
      Answer: [
        { type: 16, data: `"v=spf1 -all"` },
        { type: 5, data: "radmakr.github.io." },
        { type: 16, data: `"did=${did}"` },
      ],
    };
    expect(didFromDnsAnswer(answer, handle)).toBe(did);
  });

  test("explains each way the lookup can fail", () => {
    expect(failure(() => didFromDnsAnswer({ Status: 3 }, handle)).message).toContain("no _atproto record");
    expect(failure(() => didFromDnsAnswer({ Status: 2 }, handle)).message).toContain("failed");
    expect(failure(() => didFromDnsAnswer({ Status: 0 }, handle)).message).toContain("no did= record");

    const twice = { Status: 0, Answer: [{ type: 16, data: `"did=${did}"` }, { type: 16, data: `"did=did:plc:other"` }] };
    expect(failure(() => didFromDnsAnswer(twice, handle)).message).toContain("more than one");

    const garbage = { Status: 0, Answer: [{ type: 16, data: `"did=not a did"` }] };
    expect(failure(() => didFromDnsAnswer(garbage, handle)).message).toContain("isn’t a DID");
  });
});

describe("pdsFromDidDocument", () => {
  test("finds the PDS and confirms the handle points back", () => {
    expect(pdsFromDidDocument(didDocument, did, handle)).toEqual({ pds, handleMatches: true });
  });

  test("notices when the DID document claims a different handle", () => {
    const document = { ...didDocument, alsoKnownAs: ["at://someone.else"] };
    expect(pdsFromDidDocument(document, did, handle).handleMatches).toBe(false);
  });

  test("rejects a document for another DID", () => {
    expect(failure(() => pdsFromDidDocument(didDocument, "did:plc:other", handle)).step).toBe("did");
  });

  test("requires an https PDS", () => {
    const missing = { ...didDocument, service: [] };
    expect(failure(() => pdsFromDidDocument(missing, did, handle)).message).toContain("doesn’t name a PDS");

    const insecure = {
      ...didDocument,
      service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: "http://pds.example" }],
    };
    expect(failure(() => pdsFromDidDocument(insecure, did, handle)).step).toBe("did");
  });
});

describe("collections", () => {
  test("map NSIDs to the apps that wrote them", () => {
    expect(appForCollection("app.bsky.feed.post").name).toBe("Bluesky");
    expect(appForCollection("chat.bsky.actor.declaration").name).toBe("Bluesky");
    expect(appForCollection("sh.tangled.repo").name).toBe("Tangled");
    expect(appForCollection("org.tangled.key.sshKey").name).toBe("Tangled");
    expect(appForCollection("xyz.effem.feed.comment")).toMatchObject({ name: "Effem", mine: true });
  });

  test("fall back to the domain for apps without a friendly name", () => {
    const app = appForCollection("pub.leaflet.document");
    expect(app.name).toBe("leaflet.pub");
    expect(app.url).toBeUndefined();
  });

  test("group the recorded repo by app, biggest first", () => {
    const groups = groupCollections(repoDescription.collections);
    expect(groups.map(({ name, collections }) => [name, collections.length])).toEqual([
      ["Tangled", 10],
      ["Bluesky", 7],
      ["Effem", 4],
      ["Germ", 1],
    ]);
    expect(groups.filter((group) => group.mine).map((group) => group.name)).toEqual(["Effem"]);
  });
});

describe("resolveHandle", () => {
  const responses = new Map<string, unknown>([
    [dnsURL(handle), dnsAnswer],
    [didDocumentURL(did), didDocument],
    [describeRepoURL(pds, did), repoDescription],
  ]);

  function stubFetch(overrides: Record<string, () => Response | Promise<Response>> = {}) {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      const override = Object.entries(overrides).find(([prefix]) => url.startsWith(prefix));
      if (override) return override[1]();
      const body = responses.get(url);
      return body === undefined ? new Response("missing", { status: 404 }) : Response.json(body);
    };
    return { fetch, requests };
  }

  function steppingClock(stride = 10) {
    let time = 0;
    return () => (time += stride);
  }

  test("walks handle → DID → PDS → repo", async () => {
    const { fetch, requests } = stubFetch();
    const events: { id: string; state: string; ms?: number }[] = [];

    const result = await resolveHandle("@radmakr.com", {
      fetch,
      now: steppingClock(),
      onStep: ({ id, state, ms }) => events.push({ id, state, ms }),
    });

    expect(result).toMatchObject({ handle, did, pds, handleMatches: true });
    expect(result.repo).toMatchObject({ handle, handleIsCorrect: true, count: 22 });
    expect(result.repo.apps.map((app) => app.name)).toEqual(["Tangled", "Bluesky", "Effem", "Germ"]);
    expect(requests.map(({ url }) => new URL(url).host)).toEqual([
      "cloudflare-dns.com",
      "plc.directory",
      "inkcap.us-east.host.bsky.network",
    ]);
    expect(new Headers(requests[0]?.init?.headers).get("accept")).toBe("application/dns-json");
    expect(events).toEqual([
      { id: "dns", state: "pending", ms: undefined },
      { id: "dns", state: "done", ms: 10 },
      { id: "did", state: "pending", ms: undefined },
      { id: "did", state: "done", ms: 10 },
      { id: "repo", state: "pending", ms: undefined },
      { id: "repo", state: "done", ms: 10 },
    ]);
  });

  test("reports which step failed and stops there", async () => {
    const { fetch, requests } = stubFetch({
      "https://plc.directory/": () => new Response("down", { status: 503 }),
    });
    const states: string[] = [];

    const error = await resolveHandle(handle, {
      fetch,
      onStep: ({ id, state }) => states.push(`${id}:${state}`),
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ResolveError);
    expect(error).toMatchObject({ step: "did", message: "plc.directory answered 503." });
    expect(states).toEqual(["dns:pending", "dns:done", "did:pending", "did:error"]);
    expect(requests).toHaveLength(2);
  });

  test("turns network errors and bad JSON into readable failures", async () => {
    const offline = stubFetch({
      "https://cloudflare-dns.com/": () => Promise.reject(new TypeError("Load failed")),
    });
    await expect(resolveHandle(handle, { fetch: offline.fetch })).rejects.toMatchObject({
      step: "dns",
      message: "Couldn’t reach cloudflare-dns.com.",
    });

    const garbled = stubFetch({ [pds]: () => new Response("<html>") });
    await expect(resolveHandle(handle, { fetch: garbled.fetch })).rejects.toMatchObject({
      step: "repo",
      message: "inkcap.us-east.host.bsky.network didn’t send JSON.",
    });
  });

  test("flags a repo whose handle doesn't match", async () => {
    const { fetch } = stubFetch({
      [pds]: () => Response.json({ ...repoDescription, handle: "someone.else" }),
    });
    const result = await resolveHandle(handle, { fetch });
    expect(result.repo.handleIsCorrect).toBe(false);
  });
});
