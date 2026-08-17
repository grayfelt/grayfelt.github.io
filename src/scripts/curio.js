/* ============================================================
   curio.js
   Hover is pure CSS. This handles the click-to-open record.
   Object data is embedded in the page as JSON by curio.njk, so
   there is no fetch and no loading state.
   ============================================================ */

(function () {
  "use strict";

  const dialog = document.getElementById("object-dialog");
  const inner = document.getElementById("object-dialog-inner");
  const dataEl = document.getElementById("objects-data");
  if (!dialog || !inner || !dataEl) return;

  let objects = [];
  try {
    objects = JSON.parse(dataEl.textContent);
  } catch (err) {
    console.error("[curio] Could not read object data:", err);
    return;
  }

  const bySlug = new Map(objects.map((o) => [o.slug, o]));
  let lastFocused = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function render(obj) {
    const notes = (obj.notes || [])
      .map((n) => `<p class="note">${escapeHtml(n)}</p>`)
      .join("");
    const meta = [obj.origin, obj.acquired].filter(Boolean).join(" · ");

    inner.innerHTML = `
      <img src="/assets/images/objects/${escapeHtml(obj.image)}.png"
           alt="${escapeHtml(obj.title)}">
      <div>
        <h2>${escapeHtml(obj.title)}</h2>
        ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
        ${notes}
      </div>`;
  }

  function open(slug, trigger) {
    const obj = bySlug.get(slug);
    if (!obj) return;
    lastFocused = trigger;
    render(obj);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function close() {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
  }

  /* One delegated listener, so objects added later still work */
  document.addEventListener("click", function (event) {
    const button = event.target.closest(".shelf-object");
    if (button) { open(button.dataset.slug, button); return; }
    if (event.target.closest(".dialog-close")) close();
  });

  /* Click the backdrop to dismiss */
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });

  /* Give focus back so keyboard users don't lose their place */
  dialog.addEventListener("close", function () {
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  });
})();
