/* ============================================================
   main.js
   The word-tilt effect, fixed.

   OLD VERSION was:
     element.innerHTML.split(' ')  ->  wrap each piece in a span

   That treats HTML as plain text, so any <a>, <em>, or <img>
   inside a paragraph got chopped into pieces and destroyed.
   That's why the links in "Saved for later" broke.

   NEW VERSION walks only the text nodes, leaving every real
   element untouched.
   ============================================================ */

(function () {
  "use strict";

  /* Only headings, dates and list items get the tilt.
   Body paragraphs stay untouched: it keeps long text readable, and
   wrapping paragraph text in spans would break the rubricated
   ::first-letter drop caps. */
const SELECTOR = ".blog-entry-title, .blog-entry-date, .manuscript-header h1, li";
  const MIN_WIDTH = 700; // skip the effect on phones — it hurts legibility

  function tiltTextNodes(root) {
    // A TreeWalker visits nodes one at a time. We ask for text
    // nodes only, so tags are never even considered.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        // don't touch anything already processed, or inside code
        if (node.parentElement.closest(".random-text, code, pre, script, style")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) textNodes.push(current);

    for (const node of textNodes) {
      const fragment = document.createDocumentFragment();
      // split but KEEP the whitespace, so spacing survives
      const parts = node.nodeValue.split(/(\s+)/);

      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          continue;
        }
        const span = document.createElement("span");
        span.className = "random-text";
        const rotation = (Math.random() - 0.5) * 2;
        const yOffset = (Math.random() - 0.5) * 3;
        span.style.transform = `rotate(${rotation}deg) translateY(${yOffset}px)`;
        span.textContent = part;
        fragment.appendChild(span);
      }

      node.parentNode.replaceChild(fragment, node);
    }
  }

  function shouldRun() {
    if (window.innerWidth < MIN_WIDTH) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!shouldRun()) return;
    document.querySelectorAll(SELECTOR).forEach(tiltTextNodes);
  });

  /* ---- shiny gold gradient on scroll (unchanged behaviour,
          but throttled so it doesn't fire hundreds of times) ---- */
  let queued = false;
  document.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      const viewportHeight = window.innerHeight;
      document.querySelectorAll(".shiny-gold").forEach(function (header) {
        const rect = header.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(viewportHeight / 2 - elementCenter);
        const angle = (distance * 0.2) % 360;
        header.style.setProperty("--gradient-angle", angle + "deg");
      });
    });
  }, { passive: true });
})();
