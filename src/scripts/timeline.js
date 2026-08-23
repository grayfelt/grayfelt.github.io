/* ============================================================
   timeline.js
   Three tiers:
   1. Track: click a bundle -> tier 2. Click a standalone photo ->
      tier 3 directly, skipping the bundle view entirely.
   2. Bundle dialog: a bundle's photos live inertly in a <template>
      next to it on the track (never laid out or painted until
      opened), cloned into the dialog's fan area on click, then
      faded/scaled into their fanned-out positions.
   3. Photo dialog: reuses whichever <picture> is already rendered
      on the card that opened it — no data duplication.

   Also drives the wheel: as the track scrolls, work out which
   dated item is centred and highlight it there and in the sticky
   year label.
   ============================================================ */

(function () {
  "use strict";

  const bundleDialog = document.getElementById("bundle-dialog");
  const fanArea = document.getElementById("fan-area");
  const bundleTitleEl = document.getElementById("bundle-dialog-title");
  const bundleSubtitleEl = document.getElementById("bundle-dialog-subtitle");
  const photoDialog = document.getElementById("photo-dialog");
  const photoInner = document.getElementById("photo-dialog-inner");

  let lastBundleTrigger = null;
  let lastPhotoTrigger = null;
  // Closing a <dialog> can otherwise leave the page scrolled to the
  // top — some browsers reset scroll when lifting the modal's
  // background scroll-lock, and refocusing the trigger button (below)
  // can itself scroll if it's ever offscreen. Recorded whenever a
  // dialog opens from the main track, restored after it closes.
  let savedScrollY = null;

  function openPhoto(card) {
    if (!photoDialog || !photoInner) return;
    const media = card.querySelector("picture, .image-missing");
    photoInner.innerHTML = "";
    if (media) photoInner.appendChild(media.cloneNode(true));

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = card.dataset.date || "";

    const detail = document.createElement("p");
    detail.textContent = card.dataset.detail || card.dataset.caption || "";

    photoInner.appendChild(meta);
    photoInner.appendChild(detail);

    lastPhotoTrigger = card;
    if (typeof photoDialog.showModal === "function") photoDialog.showModal();
    else photoDialog.setAttribute("open", "");
  }

  function closePhoto() {
    if (!photoDialog) return;
    if (photoDialog.close) photoDialog.close();
    else photoDialog.removeAttribute("open");
  }

  function openBundle(button) {
    if (!bundleDialog || !fanArea) return;
    const key = button.dataset.bundleKey;
    const template = document.querySelector('template.bundle-photos[data-bundle-key="' + CSS.escape(key) + '"]');
    if (!template) return;

    fanArea.classList.remove("is-open");
    fanArea.innerHTML = "";
    fanArea.appendChild(template.content.cloneNode(true));

    if (bundleTitleEl) bundleTitleEl.textContent = button.dataset.title || "";
    if (bundleSubtitleEl) bundleSubtitleEl.textContent = button.dataset.subtitle || "";

    lastBundleTrigger = button;
    if (typeof bundleDialog.showModal === "function") bundleDialog.showModal();
    else bundleDialog.setAttribute("open", "");

    // Two rAFs: one to let the clone paint at its collapsed state,
    // one more before adding .is-open so the transition actually runs
    // instead of the browser coalescing both changes into one frame.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fanArea.classList.add("is-open");
      });
    });
  }

  function closeBundle() {
    if (!bundleDialog) return;
    if (photoDialog && photoDialog.open) closePhoto();
    if (bundleDialog.close) bundleDialog.close();
    else bundleDialog.removeAttribute("open");
  }

  document.addEventListener("click", function (event) {
    const bundleBtn = event.target.closest(".bundle");
    if (bundleBtn) {
      if (savedScrollY === null) savedScrollY = window.scrollY;
      openBundle(bundleBtn);
      return;
    }

    const photoBtn = event.target.closest(".single-photo, .fan-photo");
    if (photoBtn) {
      if (savedScrollY === null) savedScrollY = window.scrollY;
      openPhoto(photoBtn);
      return;
    }

    if (event.target.closest("#photo-dialog .dialog-close")) { closePhoto(); return; }
    if (event.target.closest("#bundle-dialog .dialog-close")) { closeBundle(); return; }
  });

  function restoreScroll() {
    if (savedScrollY === null) return;
    window.scrollTo(0, savedScrollY);
    savedScrollY = null;
  }

  if (photoDialog) {
    photoDialog.addEventListener("click", function (event) {
      if (event.target === photoDialog) closePhoto();
    });
    photoDialog.addEventListener("close", function () {
      if (lastPhotoTrigger && document.contains(lastPhotoTrigger)) lastPhotoTrigger.focus({ preventScroll: true });
      // still inside the bundle dialog (tier 2 stays open) — nothing to restore yet
      if (!(bundleDialog && bundleDialog.open)) restoreScroll();
    });
  }

  if (bundleDialog) {
    bundleDialog.addEventListener("click", function (event) {
      if (event.target === bundleDialog) closeBundle();
    });
    bundleDialog.addEventListener("close", function () {
      fanArea.classList.remove("is-open");
      if (lastBundleTrigger && document.contains(lastBundleTrigger)) lastBundleTrigger.focus({ preventScroll: true });
      restoreScroll();
    });
  }

  // ---- sidebar month tracking ----
  const currentYearLabel = document.getElementById("timeline-current-year");
  const monthBlocks = Array.from(document.querySelectorAll(".month-block"));
  const sidebarMonths = new Map(
    monthBlocks.map((block) => [block.dataset.monthKey, block.querySelector(".sidebar-month")])
  );
  const years = new Map(monthBlocks.map((block) => [block.dataset.monthKey, block.dataset.year]));
  if (!monthBlocks.length) return;

  let currentKey = null;

  function updateActiveMonth() {
    const viewportCenter = window.innerHeight / 2;

    let closestKey = null;
    let closestDistance = Infinity;
    for (const block of monthBlocks) {
      const rect = block.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestKey = block.dataset.monthKey;
      }
    }

    if (closestKey === currentKey) return;
    if (currentKey !== null) sidebarMonths.get(currentKey)?.classList.remove("is-current");
    currentKey = closestKey;
    sidebarMonths.get(currentKey)?.classList.add("is-current");
    if (currentYearLabel && years.has(currentKey)) {
      currentYearLabel.textContent = years.get(currentKey);
    }
  }

  updateActiveMonth();

  let queued = false;
  window.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      updateActiveMonth();
    });
  }, { passive: true });

  window.addEventListener("resize", updateActiveMonth);
})();
