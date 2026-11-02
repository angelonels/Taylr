const blocked = new Set([
  "HTML",
  "BODY",
  "HEAD",
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
]);
export function canSelect(element: Element): boolean {
  return !blocked.has(element.tagName) && element.getRootNode() === document;
}
function linkSelector(tag: string, value: string): string {
  const [address, ...fragment] = value.split("#");
  const question = address.indexOf("?");
  if (question < 0) return `${tag}[href=${CSS.escape(value)}]`;
  const path = address.slice(0, question);
  const parameters = address
    .slice(question + 1)
    .split("&")
    .filter(Boolean);
  let productAttribution = false;
  let videoAttribution = false;
  try {
    const url = new URL(value, location.href);
    // These observed per-visit values are attribution only on Flipkart product
    // links. Preserve their meaning everywhere else, and retain the SKU/query.
    productAttribution =
      /^(www\.)?flipkart\.com$/.test(url.hostname) &&
      /\/p\/itm[a-z0-9]+\/?$/i.test(url.pathname) &&
      !!url.searchParams.get("pid");
    // Observed YouTube search impressions change pp for the same video.
    // Retain every other query value, including playlist and playback position.
    videoAttribution =
      /^(www\.)?youtube\.com$/.test(url.hostname) &&
      url.pathname === "/watch" &&
      !!url.searchParams.get("v");
  } catch {
    // Non-URL hrefs retain their exact identity.
  }
  // Ignore known attribution IDs only; query parameters can be the content identity.
  const stable = parameters.filter(
    (parameter) =>
      !/^(utm_[^=]*|fbclid|gclid|source_impression_id|federated_search_id|previous_page_section_name)=/i.test(
        parameter,
      ) &&
      !(productAttribution && /^(iid|ssid|ppt|ppn)=/i.test(parameter)) &&
      !(videoAttribution && /^pp=/i.test(parameter)),
  );
  if (!path || stable.length === 0 || stable.length === parameters.length)
    return `${tag}[href=${CSS.escape(value)}]`;
  let selector = `${tag}:is([href=${CSS.escape(path)}],[href^=${CSS.escape(path + "?")}])`;
  for (const parameter of stable) {
    const boundaries = [
      ["*", "?" + parameter + "&"],
      ["*", "&" + parameter + "&"],
      ["$", "?" + parameter],
      ["$", "&" + parameter],
      ["*", "?" + parameter + "#"],
      ["*", "&" + parameter + "#"],
    ];
    selector += `:is(${boundaries.map(([operator, token]) => `[href${operator}=${CSS.escape(token)}]`).join(",")})`;
  }
  if (fragment.length)
    selector += `[href$=${CSS.escape("#" + fragment.join("#"))}]`;
  return selector;
}
function* ownedLinks(scope: Element): Generator<string> {
  const seen = new Set<string>();
  for (const link of scope.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href");
    if (!href || href === "#") continue;
    const ownership = [linkSelector("a", href)];
    let parent: Element | null = link.parentElement;
    while (parent && parent !== scope) {
      ownership.unshift(CSS.escape(parent.localName));
      parent = parent.parentElement;
    }
    const path = `> ${ownership.join(" > ")}`;
    if (parent === scope && !seen.has(path)) {
      seen.add(path);
      yield path;
    }
  }
}
export function selectorFor(element: Element): string | null {
  if (!canSelect(element)) return null;
  const unique = (selector: string) => {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  };
  const path: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body) {
    const name = node.localName;
    const tag = CSS.escape(name);
    const candidates: string[] = [];
    let combined = tag;
    for (const attr of [
      "data-testid",
      "data-test-id",
      "data-a-target",
      "data-e2e",
      "data-asin",
      "href",
      "aria-label",
      "alt",
      "aria-haspopup",
      "name",
      "role",
    ]) {
      const value = node.getAttribute(attr);
      if (!value || (attr === "alt" && !value.trim())) continue;
      const selector =
        attr === "href"
          ? linkSelector(tag, value)
          : `${tag}[${attr}=${CSS.escape(value)}]`;
      const full = [selector, ...path].join(" > ");
      if (unique(full)) return full;
      candidates.push(selector);
      combined += selector.slice(tag.length);
      const combinedPath = [combined, ...path].join(" > ");
      if (unique(combinedPath)) return combinedPath;
    }
    // UUIDs and React-generated identifiers describe a render, not a persistent element.
    const generatedId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        node.id,
      ) || /^[:_]r[\w:-]*[:_]$/.test(node.id);
    if (node.id && !generatedId) {
      const selector = `${tag}#${CSS.escape(node.id)}`;
      const full = [selector, ...path].join(" > ");
      if (unique(full)) return full;
    }
    // Retain link ownership inside the card. A descendant-only anchor can
    // broaden when another page section repeats the same content link later.
    // Stop building unrelated paths once a link identifies this component.
    // Reuse paths locally if a later semantic candidate must be tried.
    const links = ownedLinks(node);
    const visitedLinks: string[] = [];
    // Keep semantic attribute combinations ahead of a child content link.
    for (const selector of [...candidates, tag]) {
      for (const link of visitedLinks) {
        const anchoredPath = [`${selector}:has(${link})`, ...path].join(" > ");
        if (unique(anchoredPath)) return anchoredPath;
      }
      for (const link of links) {
        visitedLinks.push(link);
        const anchoredPath = [`${selector}:has(${link})`, ...path].join(" > ");
        if (unique(anchoredPath)) return anchoredPath;
      }
    }
    const peers = node.parentElement
      ? [...node.parentElement.children].filter(
          (peer) => peer.localName === name,
        )
      : [];
    // A lazy-image placeholder can appear beside the selected picture later.
    // Keep its alternative text even when only the surrounding card is unique.
    const alt = name === "img" ? node.getAttribute("alt") : null;
    const segment = alt?.trim() ? `${tag}[alt=${CSS.escape(alt)}]` : tag;
    const matchingPeers = alt?.trim()
      ? peers.filter((peer) => peer.getAttribute("alt") === alt)
      : peers;
    const part =
      matchingPeers.length > 1
        ? alt?.trim()
          ? `${segment}:nth-child(${matchingPeers.indexOf(node) + 1} of ${segment})`
          : `${segment}:nth-of-type(${peers.indexOf(node) + 1})`
        : segment;
    path.unshift(part);
    const full = path.join(" > ");
    if (unique(full)) return full;
    node = node.parentElement;
  }
  const full = `body > ${path.join(" > ")}`;
  return unique(full) ? full : null;
}
