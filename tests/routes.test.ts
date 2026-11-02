import { describe, expect, test } from "bun:test";
import { resolveRequestPath } from "../scripts/routes.ts";

const files = new Set([
  "index.html",
  "404.html",
  "assets/css/site.css",
  "notes.html",
  "projects/index.html",
  ".well-known/atproto-did",
]);
const exists = async (path: string) => files.has(path);

describe("resolveRequestPath", () => {
  test("serves index.html at the root", async () => {
    expect(await resolveRequestPath("/", exists)).toBe("index.html");
  });

  test("serves files by their path", async () => {
    expect(await resolveRequestPath("/assets/css/site.css", exists)).toBe("assets/css/site.css");
    expect(await resolveRequestPath("/404.html", exists)).toBe("404.html");
  });

  test("supports clean URLs like GitHub Pages", async () => {
    expect(await resolveRequestPath("/notes", exists)).toBe("notes.html");
    expect(await resolveRequestPath("/projects", exists)).toBe("projects/index.html");
    expect(await resolveRequestPath("/projects/", exists)).toBe("projects/index.html");
  });

  test("decodes percent-escapes before looking", async () => {
    expect(await resolveRequestPath("/assets/css/site%2Ecss", exists)).toBe("assets/css/site.css");
  });

  test("returns nothing for files that aren't there", async () => {
    expect(await resolveRequestPath("/missing", exists)).toBeUndefined();
    expect(await resolveRequestPath("/assets/", exists)).toBeUndefined();
  });

  test("refuses to leave the site or serve dotfiles", async () => {
    for (const path of ["/../secrets", "/%2e%2e/secrets", "/assets/..%2F..%2Fetc", "/.git/config", "/a\\b", "/%E0%A4%A"]) {
      expect(await resolveRequestPath(path, exists)).toBeUndefined();
    }
  });

  test("still serves .well-known", async () => {
    expect(await resolveRequestPath("/.well-known/atproto-did", exists)).toBe(".well-known/atproto-did");
  });
});
