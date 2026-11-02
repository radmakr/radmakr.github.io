import { resolveHandle } from "./resolve.js";

const root = document.documentElement;

// MARK: - Storage

function readTheme() {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

function saveTheme(theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // Private windows can refuse storage. The choice still lasts until reload.
  }
}

// MARK: - Theme

const themes = ["system", "light", "dark"];

function setUpThemeToggle() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;

  const label = button.querySelector("[data-theme-label]");
  const themeColors = [...document.querySelectorAll('meta[name="theme-color"]')];
  const systemColors = themeColors.map((meta) => meta.content);
  let current = readTheme();

  function apply(theme) {
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;

    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    const description = `Theme: ${theme} (switches to ${next})`;
    button.dataset.current = theme;
    button.title = description;
    if (label) label.textContent = description;

    const background = getComputedStyle(root).getPropertyValue("--bg").trim();
    themeColors.forEach((meta, index) => {
      meta.content = theme === "system" ? systemColors[index] : background;
    });
  }

  apply(current);
  button.hidden = false;
  button.addEventListener("click", () => {
    current = themes[(themes.indexOf(current) + 1) % themes.length];
    apply(current);
    saveTheme(current);
  });
}

// MARK: - Header

function setUpHeader() {
  const header = document.querySelector("[data-header]");
  if (!header) return;

  const update = () => header.toggleAttribute("data-scrolled", window.scrollY > 4);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

// MARK: - Copy

function setUpCopyButtons() {
  for (const button of document.querySelectorAll("[data-copy]")) {
    const label = button.querySelector("[data-copy-label]");
    let reset;

    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.toggleAttribute("data-copied", true);
        if (label) label.textContent = "Copied";
      } catch {
        const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";
        if (label) label.textContent = `Press ${shortcut}`;
        window.getSelection()?.selectAllChildren(button.previousElementSibling);
      }
      clearTimeout(reset);
      reset = setTimeout(() => {
        button.toggleAttribute("data-copied", false);
        if (label) label.textContent = "Copy";
      }, 2000);
    });
  }
}

// MARK: - Small things

function fillYear() {
  const year = String(new Date().getFullYear());
  for (const element of document.querySelectorAll("[data-year]")) element.textContent = year;
}

function fillMissingPath() {
  for (const element of document.querySelectorAll("[data-path]")) {
    element.textContent = `${location.host}${location.pathname}`;
  }
}

// MARK: - Resolver

function element(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.href) node.href = options.href;
  node.append(...children.filter((child) => child !== undefined));
  return node;
}

const code = (text) => element("code", {}, text);
const mark = (passed) =>
  passed ? element("span", { className: "ok" }, "✓") : element("span", { className: "bad" }, "✗");

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const renderers = {
  dns: (did) => [element("p", {}, code(`did=${did}`))],

  did: ({ pds, handleMatches }, handle) => [
    element("p", {}, "alsoKnownAs ", code(`at://${handle}`), " ", mark(handleMatches)),
    element("p", {}, "PDS ", code(new URL(pds).host)),
  ],

  repo: ({ handleIsCorrect, count, apps }) => [
    element(
      "p",
      {},
      handleIsCorrect ? "handle verified " : "handle not verified ",
      mark(handleIsCorrect),
      ` · ${plural(count, "collection")} from ${plural(apps.length, "app")}`,
    ),
    element(
      "ul",
      { className: "chips" },
      ...apps.map((app) => {
        const content = [
          `${app.name} `,
          element("span", { className: "chip-count" }, String(app.collections.length)),
          app.mine ? element("span", { className: "visually-hidden" }, " (one of my apps)") : undefined,
        ];
        const className = app.mine ? "chip chip--mine" : "chip";
        return element(
          "li",
          {},
          app.url ? element("a", { className, href: app.url }, ...content) : element("span", { className }, ...content),
        );
      }),
    ),
  ],
};

function setUpResolver() {
  const resolver = document.querySelector("[data-resolver]");
  const button = resolver?.querySelector("[data-resolve]");
  const status = resolver?.querySelector("[data-status]");
  if (!resolver || !button || !status) return;

  const handle = resolver.dataset.handle;
  const steps = new Map(
    [...resolver.querySelectorAll("[data-step]")].map((step) => [
      step.dataset.step,
      { step, value: step.querySelector("[data-value]"), time: step.querySelector("[data-time]") },
    ]),
  );

  function show({ id, state, ms, value, error }) {
    const parts = steps.get(id);
    if (!parts) return;

    parts.step.dataset.state = state;
    if (state === "done") {
      parts.value?.replaceChildren(...renderers[id](value, handle));
      if (parts.time) parts.time.textContent = `${ms} ms`;
    } else if (state === "error") {
      parts.value?.replaceChildren(element("p", {}, error.message));
    }
  }

  button.hidden = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    for (const { step, time } of steps.values()) {
      step.dataset.state = "waiting";
      if (time) time.textContent = "";
    }
    status.textContent = `Resolving ${handle}…`;

    try {
      const result = await resolveHandle(handle, { onStep: show });
      status.textContent = `Resolved live in ${result.ms} ms: ${result.handle} is ${result.did}, hosted at ${new URL(result.pds).host}.`;
    } catch (error) {
      const failedStep = [...steps.keys()].indexOf(error?.step) + 1;
      status.textContent =
        failedStep > 0 ? `Stopped at step ${failedStep}: ${error.message}` : `Couldn’t resolve ${handle}: ${error?.message}`;
    } finally {
      button.disabled = false;
      button.textContent = "Resolve again";
    }
  });
}

// MARK: - Start

setUpThemeToggle();
setUpHeader();
setUpCopyButtons();
setUpResolver();
fillYear();
fillMissingPath();
