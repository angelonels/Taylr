const reason = new URL(location.href).searchParams.get("reason");
const copy: Record<string, [string, string]> = {
  protected: [
    "Chrome protects this page",
    "Taylr works on regular websites. Chrome’s internal pages and Web Store do not allow page extensions.",
  ],
  changed: [
    "This page changed",
    "Click Taylr’s icon on the current page to open its tools.",
  ],
  denied: [
    "Site access is unavailable",
    "Use Chrome’s extension settings to allow access to this website. Chrome may restrict access on managed pages.",
  ],
};
const content = reason ? copy[reason] : undefined;
if (content) {
  document.getElementById("title")!.textContent = content[0];
  document.getElementById("message")!.textContent = content[1];
}
