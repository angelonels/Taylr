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
export function selectorFor(element: Element): string | null {
  if (!canSelect(element)) return null;
  const unique = (selector: string) => {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  };
  const path: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body) {
    const tag = node.localName;
    if (node.id) {
      const selector = `${tag}#${CSS.escape(node.id)}`;
      const full = [selector, ...path].join(" > ");
      if (unique(full)) return full;
    }
    for (const attr of ["data-testid", "aria-label", "name"]) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      const selector = `${tag}[${attr}=${CSS.escape(value)}]`;
      const full = [selector, ...path].join(" > ");
      if (unique(full)) return full;
    }
    const peers = node.parentElement
      ? [...node.parentElement.children].filter(
          (peer) => peer.localName === tag,
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
