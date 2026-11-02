// Checks that every outside link on the site still answers. It needs the
// network, so it lives here instead of in `bun test`. Run it now and then.
//
//   bun run links

import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pages = ["index.html", "404.html"];

// These sites turn away scripts no matter what, so a refusal isn't a broken link.
const unverifiable = new Set(["www.linkedin.com"]);

const links = new Set<string>();
for (const page of pages) {
  const html = await Bun.file(join(root, page)).text();
  await new HTMLRewriter()
    .on("a[href]", {
      element(element) {
        const href = element.getAttribute("href") ?? "";
        if (href.startsWith("https://")) links.add(href);
      },
    })
    .transform(new Response(html))
    .text();
}

type Result = { url: string; status: number; error?: string };

async function check(url: string): Promise<Result> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; radmakr.com link check)" },
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    return { url, status: response.status };
  } catch (error) {
    return { url, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const results = (await Promise.all([...links].map(check))).sort((a, b) => a.url.localeCompare(b.url));

let broken = 0;
for (const { url, status, error } of results) {
  const answered = status >= 200 && status < 400;
  const excused = !answered && unverifiable.has(new URL(url).host);
  if (!answered && !excused) broken += 1;

  const mark = answered ? "✓" : excused ? "?" : "✗";
  console.log(`${mark} ${status || "---"} ${url}${error ? `  (${error})` : ""}`);
}

console.log(
  broken === 0
    ? `\nAll ${results.length} links answered.`
    : `\n${broken} of ${results.length} links look broken.`,
);
process.exit(broken === 0 ? 0 : 1);
