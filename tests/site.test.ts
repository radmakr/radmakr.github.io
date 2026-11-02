import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import dnsAnswer from "./fixtures/dns.json";
import didDocument from "./fixtures/did.json";

const root = join(import.meta.dir, "..");
const origin = "https://radmakr.com";

// MARK: - Reading pages

type Reference = { tag: string; attribute: string; value: string };

type Page = {
  html: string;
  lang: string;
  title: string;
  ids: string[];
  references: Reference[];
  images: { src: string; hasAlt: boolean; width: string | null; height: string | null }[];
  links: { href: string; target: string | null; rel: string }[];
  meta: Map<string, string>;
  jsonLd: string[];
  svgs: { className: string; width: string | null; height: string | null; fill: string | null; drawsShapes: boolean }[];
};

const referenceAttributes: [selector: string, attribute: string][] = [
  ["a[href]", "href"],
  ["link[href]", "href"],
  ["script[src]", "src"],
  ["img[src]", "src"],
  ["source[src]", "src"],
  ["iframe[src]", "src"],
  ["use[href]", "href"],
];

async function readPage(file: string): Promise<Page> {
  const html = await Bun.file(join(root, file)).text();
  const page: Page = {
    html,
    lang: "",
    title: "",
    ids: [],
    references: [],
    images: [],
    links: [],
    meta: new Map(),
    jsonLd: [],
    svgs: [],
  };

  let rewriter = new HTMLRewriter()
    .on("html", { element: (element) => void (page.lang = element.getAttribute("lang") ?? "") })
    .on("title", { text: (chunk) => void (page.title += chunk.text) })
    .on("[id]", { element: (element) => void page.ids.push(element.getAttribute("id") ?? "") })
    .on("img", {
      element: (element) =>
        void page.images.push({
          src: element.getAttribute("src") ?? "",
          // getAttribute returns null for alt="", so ask whether it's there at all.
          hasAlt: element.hasAttribute("alt"),
          width: element.getAttribute("width"),
          height: element.getAttribute("height"),
        }),
    })
    .on("a[href]", {
      element: (element) =>
        void page.links.push({
          href: element.getAttribute("href") ?? "",
          target: element.getAttribute("target"),
          rel: element.getAttribute("rel") ?? "",
        }),
    })
    .on("meta[content]", {
      element: (element) => {
        const key = element.getAttribute("property") ?? element.getAttribute("name");
        if (key) page.meta.set(key, element.getAttribute("content") ?? "");
      },
    });

  rewriter = rewriter.on("svg", {
    element: (element) =>
      void page.svgs.push({
        className: element.getAttribute("class") ?? "",
        width: element.getAttribute("width"),
        height: element.getAttribute("height"),
        fill: element.getAttribute("fill"),
        drawsShapes: false,
      }),
  });

  // Shapes directly inside an <svg> (not inside a sprite's <symbol>) belong to the
  // drawing that was opened last; SVGs here are never nested.
  for (const shape of ["circle", "path", "rect", "ellipse", "polygon", "line"]) {
    rewriter = rewriter.on(`svg > ${shape}`, {
      element: () => {
        const svg = page.svgs.at(-1);
        if (svg) svg.drawsShapes = true;
      },
    });
  }

  rewriter = rewriter.on('script[type="application/ld+json"]', {
    element: () => void page.jsonLd.push(""),
    text: (chunk) => void (page.jsonLd[page.jsonLd.length - 1] += chunk.text),
  });

  for (const [selector, attribute] of referenceAttributes) {
    rewriter = rewriter.on(selector, {
      element: (element) =>
        void page.references.push({ tag: element.tagName, attribute, value: element.getAttribute(attribute) ?? "" }),
    });
  }

  await rewriter.transform(new Response(html)).text();
  return page;
}

// Returns the repo path a same-site URL points at, or nothing for other sites.
function localPath(value: string): string | undefined {
  if (/^(mailto|tel|data|javascript):/i.test(value)) return undefined;
  const url = new URL(value, `${origin}/`);
  if (url.origin !== origin) return undefined;
  const path = decodeURIComponent(url.pathname).replace(/^\//, "");
  return path === "" || path.endsWith("/") ? `${path}index.html` : path;
}

async function exists(path: string): Promise<boolean> {
  return (await Bun.file(join(root, path)).exists()) || (await Bun.file(join(root, `${path}.html`)).exists());
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// MARK: - Every page

for (const file of ["index.html", "404.html"]) {
  describe(file, () => {
    test("declares its language, title and viewport", async () => {
      const page = await readPage(file);
      expect(page.lang).toBe("en");
      expect(page.title.trim().length).toBeGreaterThan(0);
      expect(page.meta.get("viewport")).toContain("width=device-width");
      expect(page.meta.get("color-scheme")).toBe("light dark");
    });

    test("points only at files that exist", async () => {
      const page = await readPage(file);
      const missing: string[] = [];
      for (const { value } of page.references) {
        if (value.startsWith("#")) continue;
        const path = localPath(value);
        if (path && !(await exists(path))) missing.push(value);
      }
      expect(missing).toEqual([]);
    });

    test("links to fragments that exist on the page", async () => {
      const page = await readPage(file);
      const ids = new Set(page.ids);
      const broken = page.references
        .map(({ value }) => value)
        .filter((value) => value.startsWith("#") && value.length > 1 && !ids.has(value.slice(1)));
      expect(broken).toEqual([]);
    });

    test("uses each id once", async () => {
      const page = await readPage(file);
      const duplicates = page.ids.filter((id, index) => page.ids.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
    });

    test("gives every image alt text and dimensions", async () => {
      const page = await readPage(file);
      for (const image of page.images) {
        expect(image.hasAlt, image.src).toBe(true);
        expect(Number(image.width), image.src).toBeGreaterThan(0);
        expect(Number(image.height), image.src).toBeGreaterThan(0);
      }
    });

    test("sizes every inline SVG itself, so a missing stylesheet can't blow one up", async () => {
      const page = await readPage(file);
      for (const svg of page.svgs) {
        expect(svg.width, svg.className).not.toBeNull();
        expect(svg.height, svg.className).not.toBeNull();
        // Unstyled SVG shapes fill black; drawings say what they want.
        if (svg.drawsShapes) expect(svg.fill, svg.className).not.toBeNull();
      }
    });

    test("loads nothing from another server", async () => {
      const page = await readPage(file);
      const thirdParty = page.references
        .filter(({ tag }) => tag !== "a" && tag !== "use")
        .map(({ value }) => value)
        .filter((value) => /^(https?:)?\/\//.test(value) && !value.startsWith(origin));
      expect(thirdParty).toEqual([]);
      expect(page.html).not.toContain("<iframe");
    });

    test("links out over https without opening new tabs unsafely", async () => {
      const page = await readPage(file);
      for (const link of page.links) {
        expect(link.href, link.href).not.toStartWith("http://");
        if (link.target === "_blank") expect(link.rel, link.href).toContain("noopener");
      }
    });
  });
}

// MARK: - Home page

describe("index.html", () => {
  test("uses relative paths, so it also works opened from disk or from any folder", async () => {
    const page = await readPage("index.html");
    const rootRelative = page.references
      .map(({ value }) => value)
      .filter((value) => value.startsWith("/") && !value.startsWith("//"));
    expect(rootRelative).toEqual([]);
  });

  test("describes itself for search engines and link previews", async () => {
    const page = await readPage("index.html");
    expect(page.meta.get("description")?.length ?? 0).toBeGreaterThan(50);
    expect(page.html).toContain(`<link rel="canonical" href="${origin}/">`);
    expect(page.meta.get("og:title")).toBe("Thomas Rademaker");
    expect(page.meta.get("og:url")).toBe(`${origin}/`);
    expect(page.meta.get("og:image:alt")?.length ?? 0).toBeGreaterThan(20);
    expect(page.meta.get("twitter:card")).toBe("summary_large_image");
  });

  test("ships a social card that matches its declared size", async () => {
    const page = await readPage("index.html");
    const image = page.meta.get("og:image") ?? "";
    expect(image).toStartWith(`${origin}/`);

    const path = localPath(image) ?? "";
    const size = pngSize(await Bun.file(join(root, path)).bytes());
    expect(size).toEqual({
      width: Number(page.meta.get("og:image:width")),
      height: Number(page.meta.get("og:image:height")),
    });
  });

  test("has structured data for Thomas", async () => {
    const page = await readPage("index.html");
    expect(page.jsonLd).toHaveLength(1);

    const person = JSON.parse(page.jsonLd[0] ?? "");
    expect(person).toMatchObject({ "@type": "Person", name: "Thomas Rademaker", url: `${origin}/` });
    expect(person.sameAs).toContain("https://bsky.app/profile/radmakr.com");
  });

  test("marks the identity links with rel=me", async () => {
    const page = await readPage("index.html");
    const verified = page.links.filter((link) => link.rel.split(" ").includes("me")).map((link) => link.href);
    expect(verified).toEqual(
      expect.arrayContaining([
        "https://bsky.app/profile/radmakr.com",
        "https://tangled.org/@radmakr.com",
        "https://github.com/radmakr",
      ]),
    );
  });

  test("shows the same handle lookup the fixtures recorded", async () => {
    const page = await readPage("index.html");
    const did = didDocument.id;
    const pds = new URL(didDocument.service[0]?.serviceEndpoint ?? "").host;

    expect(dnsAnswer.Answer[0]?.data).toContain(did);
    expect(page.html).toContain(`did=${did}`);
    expect(page.html).toContain(pds);
  });

  test("stays small", async () => {
    const files = ["index.html", "assets/css/site.css", "assets/js/site.js", "assets/js/resolve.js"];
    let compressed = 0;
    for (const file of files) {
      compressed += Bun.gzipSync(await Bun.file(join(root, file)).bytes()).length;
    }
    expect(compressed).toBeLessThan(32 * 1024);
  });
});

// MARK: - Not found page

describe("404.html", () => {
  test("uses root-relative paths, since Pages serves it at whatever URL was missing", async () => {
    const page = await readPage("404.html");
    const relative = page.references
      .map(({ value }) => value)
      .filter((value) => !value.startsWith("#") && !/^[a-z]+:|^\//i.test(value));
    expect(relative).toEqual([]);
  });
});

// MARK: - The rest of the site

describe("site", () => {
  test("keeps the custom domain GitHub Pages needs", async () => {
    expect((await Bun.file(join(root, "CNAME")).text()).trim()).toBe("radmakr.com");
    expect(await Bun.file(join(root, ".nojekyll")).exists()).toBe(true);
  });

  test("lists the home page in the sitemap", async () => {
    const sitemap = await Bun.file(join(root, "sitemap.xml")).text();
    const robots = await Bun.file(join(root, "robots.txt")).text();
    expect(sitemap).toContain(`<loc>${origin}/</loc>`);
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  test("imports only JavaScript modules that exist", async () => {
    for (const file of ["assets/js/site.js", "assets/js/resolve.js"]) {
      const source = await Bun.file(join(root, file)).text();
      for (const [, specifier = ""] of source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        const path = join(root, file, "..", specifier);
        expect(await Bun.file(path).exists(), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  test("ships favicons", async () => {
    const icon = await Bun.file(join(root, "favicon.ico")).bytes();
    expect([...icon.slice(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(pngSize(await Bun.file(join(root, "apple-touch-icon.png")).bytes())).toEqual({ width: 180, height: 180 });
  });
});
