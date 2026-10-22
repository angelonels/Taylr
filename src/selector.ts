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
  if (stable.length === parameters.length)
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
export function selectorFor(element: Element): string | null {
  if (!canSelect(element)) return null;
  const unique = (selector: string) => {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
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
      "aria-haspopup",
      "name",
      "role",
    ]) {
      const value = node.getAttribute(attr);
      if (!value) continue;
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
    // Prefer combinations of semantic identity over a potentially attributed child link.
    for (const selector of [...candidates, tag]) {
      // A card can keep its identity through wrapper/reordering changes via its own link.
      const link = node.querySelector("a[href]");
      const href = link?.getAttribute("href");
      if (href && href !== "#") {
        const anchored = `${selector}:has(${linkSelector("a", href)})`;
        const anchoredPath = [anchored, ...path].join(" > ");
        if (unique(anchoredPath)) return anchoredPath;
      }
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
    const peers = node.parentElement
      ? [...node.parentElement.children].filter(
          (peer) => peer.localName === name,
        )
      : [];
    const part =
      peers.length > 1 ? `${tag}:nth-of-type(${peers.indexOf(node) + 1})` : tag;
    path.unshift(part);
    const full = path.join(" > ");
    if (unique(full)) return full;
    node = node.parentElement;
  }
  const full = `body > ${path.join(" > ")}`;
  return unique(full) ? full : null;
}
