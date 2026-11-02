# radmakr.com

Thomas Rademaker’s personal site: who I am, what I’ve shipped, what I believe about
Swift, and proof that this domain is my AT Protocol handle.

It’s a **static site with no build step**: plain HTML, one stylesheet and two small
JavaScript modules. The files in this repo are exactly what GitHub Pages serves. Bun runs
the local dev server and the tests; nothing needs installing.

```
.
├── index.html              # the whole site, in sections marked <!-- MARK: - … -->
├── 404.html                # Fatal error: Unexpectedly found nil…
├── assets/
│   ├── css/site.css        # all styling; tokens for both themes at the top
│   ├── js/site.js          # theme toggle, copy button, the live handle resolver
│   ├── js/resolve.js       # handle → DID → PDS → repo, as pure, tested functions
│   └── img/                # app icons (128 px WebP) and the SparrowTek mark
├── favicon.svg / favicon.ico / apple-touch-icon.png / og.png
├── CNAME                   # radmakr.com: GitHub Pages needs this for the custom domain
├── .nojekyll               # serve the files as-is, without Jekyll
├── robots.txt / sitemap.xml
├── scripts/
│   ├── serve.ts            # dev server that behaves like GitHub Pages, with live reload
│   ├── routes.ts           # its request → file mapping
│   └── check-links.ts      # checks every outside link still answers
├── tests/                  # bun test: resolver logic, routing, and site integrity
└── tools/
    ├── snapshot.swift      # renders pages and SVGs to PNG/ICO with WebKit and AppKit
    ├── images.ts           # regenerates og.png, apple-touch-icon.png and favicon.ico
    ├── og.html             # source for the social card
    └── apple-touch-icon.svg
```

## Run it locally

You need [Bun](https://bun.sh) 1.1 or newer (`brew install oven-sh/bun/bun`, or
`curl -fsSL https://bun.sh/install | bash`). There is no `bun install` step: the site has
no dependencies.

```bash
bun run dev              # → http://localhost:3000
PORT=4000 bun run dev    # another port
```

The dev server serves the repo the way GitHub Pages does (clean URLs, `404.html` for
anything missing, no dotfiles) and reloads the browser whenever you save a file.

Opening `index.html` straight from Finder works too, since its paths are relative. Browsers
won’t run JavaScript modules from `file://`, though, so the theme toggle, the copy button
and the live resolver only show up when the page is served.

## Test it

```bash
bun test
```

Three suites, all offline:

- **`resolve.test.ts`** covers the handle resolver: DNS answers (split TXT strings,
  missing or duplicate records), DID documents, collection grouping, and the full
  three-step walk against recorded responses in `tests/fixtures/`, including failures.
- **`routes.test.ts`** checks that the dev server maps paths like GitHub Pages and refuses
  `..` and dotfiles.
- **`site.test.ts`** reads the real HTML and checks that every local link and image exists,
  every `#fragment` has a target, ids are unique, images have `alt` and dimensions, every
  inline SVG sizes itself (so a missing stylesheet can’t turn one into a giant black shape),
  `index.html` uses relative paths while `404.html` uses root-relative ones, nothing loads
  from another server, the social card is the size the meta tags claim, the JSON-LD parses,
  the page stays under 32 KB gzipped, and `CNAME` still says `radmakr.com`.

Outside links need the network, so they’re checked separately:

```bash
bun run links
```

## Deploy

Push to `master`. GitHub Pages serves the repo root at https://radmakr.com within a minute
or two. There’s nothing to build and no workflow to run.

Keep `CNAME` (it holds the custom domain) and `.nojekyll` (it tells Pages to serve the
files untouched). The tests fail if either goes missing.

## Editing

Everything visible lives in `index.html`. Find a section by its `MARK` comment.

- **Now**: the card beside the name. Update the three items and the `<time>` when they
  change.
- **Shipped**: one `<li>` per app, newest first. Icons go in `assets/img/apps/` at 128×128;
  convert a 1024 px App Store icon with
  `sips -Z 128 icon.png --out icon.png && cwebp -q 86 icon.png -o assets/img/apps/name.webp`.
  App Store release dates come from
  `curl "https://itunes.apple.com/lookup?id=<app id>"` (`releaseDate`). Update the
  “Apps on the App Store” count in the stats strip too.
- **Open source**: one row per protocol, with links to the packages.
- **Opinions**: five, numbered by CSS. Number two isn’t negotiable.
- **Handle**: the resolver shows the last lookup until someone presses *Resolve live*. If the
  DID or PDS ever changes, update the cached values here and re-record the fixtures:

  ```bash
  curl -s -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=_atproto.radmakr.com&type=TXT" > tests/fixtures/dns.json
  curl -s https://plc.directory/did:plc:aq5iwu4gjdcg2hq53llism3x > tests/fixtures/did.json
  curl -s "https://inkcap.us-east.host.bsky.network/xrpc/com.atproto.repo.describeRepo?repo=did:plc:aq5iwu4gjdcg2hq53llism3x" > tests/fixtures/describe-repo.json
  ```

  `site.test.ts` fails if the page and the fixtures disagree.
- **Colors** are tokens at the top of `site.css`: one block for light, the same names
  again for dark. The accent is Swift orange. Every text color clears WCAG AA (4.5:1) on
  the backgrounds it sits on in both themes; keep it that way if you change one.
- **Fonts** are the system’s (SF Pro and SF Mono on Apple devices), so the page makes no
  font requests.

## Images

`og.png`, `apple-touch-icon.png` and `favicon.ico` are generated, so edit their sources
(`tools/og.html`, `tools/apple-touch-icon.svg`, `favicon.svg`) and run:

```bash
bun run images
```

That compiles `tools/snapshot.swift` on first use (it needs macOS with Xcode or its command
line tools) and renders each image. The social card goes through WebKit, so it looks the
way Safari draws the page; the icons rasterize through AppKit, which keeps their
transparency. The same tool takes screenshots of the running site:

```bash
.build/snapshot http://localhost:3000 home.png --size 1440x900 --scale 2 --full-page --dark
```

## The handle

`radmakr.com` is also my handle on Bluesky and Tangled. That works through a DNS record,
not anything in this repo:

```
_atproto.radmakr.com  TXT  "did=did:plc:aq5iwu4gjdcg2hq53llism3x"
```

Leave that record alone when changing DNS. The *Handle* section walks the same chain live
(DNS, then plc.directory, then the PDS), which is what `resolve.js` implements.

## Privacy

The page loads nothing from anywhere else: no fonts, analytics, cookies or embeds. The only
outside requests are the three lookups the resolver makes after a visitor presses its
button, and the page says so right there. The theme choice is kept in `localStorage` and
never leaves the browser.
