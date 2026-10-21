if (new URL(location.href).searchParams.get("reason") === "protected") {
  document.getElementById("title")!.textContent = "Chrome protects this page";
  document.getElementById("message")!.textContent =
    "Taylr works on regular websites. Chrome’s internal pages and Web Store do not allow page extensions.";
}
