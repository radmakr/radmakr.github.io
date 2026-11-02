// Maps a request path to a file in the repo the way GitHub Pages does:
// `/` serves index.html, `/about` serves about.html or about/index.html, and
// anything that would climb out of the site (or into a dotfile) serves nothing.

export type Exists = (relativePath: string) => Promise<boolean>;

export async function resolveRequestPath(pathname: string, exists: Exists): Promise<string | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const segments = decoded.split("/").filter(Boolean);
  const unsafe = segments.some(
    (segment) =>
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      (segment.startsWith(".") && segment !== ".well-known"),
  );
  if (unsafe) return undefined;

  const relative = segments.join("/");
  const candidates =
    relative === "" || decoded.endsWith("/")
      ? [relative === "" ? "index.html" : `${relative}/index.html`]
      : [relative, `${relative}.html`, `${relative}/index.html`];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}
