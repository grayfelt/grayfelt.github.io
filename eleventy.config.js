import eleventyImage, { generateHTML } from "@11ty/eleventy-img";
import fs from "node:fs";
import path from "node:path";

const ORIGINALS = "src/assets/images/originals";
// Timeline photos that belong to a bundle live in that bundle's own
// subfolder, e.g. src/assets/images/timeline/Arrival/kitchen.jpg, so
// photos in different bundles are free to share the same filename
// without colliding — this is looked up by exact folder, never by a
// slug-only search across every subfolder. A photo with no "bundle"
// field sits directly in src/assets/images/timeline/ instead.
const TIMELINE_IMAGES = "src/assets/images/timeline";
const FLOATERS = "src/assets/images/floaters";
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"];

// A slug is just a filename — strip any "folder/" prefix and any
// ".jpg"-style extension someone tacks on, so "kitchen",
// "kitchen.jpg", and "Arrival/kitchen.jpg" all resolve the same way.
function normalizeSlug(slug) {
  const base = slug.split("/").pop();
  const ext = path.extname(base);
  return EXTENSIONS.includes(ext) ? base.slice(0, base.length - ext.length) : base;
}

function findInDir(dir, slug) {
  for (const ext of EXTENSIONS) {
    const p = path.join(dir, slug + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// `folder` has three states, and they mean three different places to
// look:
//   - undefined  → not a timeline call at all (every other page's
//                  {% image %} never passes a 4th argument) — look in
//                  the flat ORIGINALS folder.
//   - "" (empty) → a timeline photo with no "bundle" of its own —
//                  look directly in TIMELINE_IMAGES, no subfolder.
//   - "Arrival"  → look in TIMELINE_IMAGES/Arrival/ specifically.
function findOriginal(slug, folder) {
  const clean = normalizeSlug(slug);
  if (folder === undefined) return findInDir(ORIGINALS, clean);
  if (folder) return findInDir(path.join(TIMELINE_IMAGES, folder), clean);
  return findInDir(TIMELINE_IMAGES, clean);
}

function findFloater(slug) {
  for (const ext of EXTENSIONS) {
    const p = path.join(FLOATERS, slug + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets/styles");
  eleventyConfig.addPassthroughCopy("src/assets/images");
  eleventyConfig.addPassthroughCopy("src/assets/fonts");
  eleventyConfig.addPassthroughCopy("src/scripts");
  eleventyConfig.addPassthroughCopy("src/CNAME");

  eleventyConfig.addCollection("posts", (collection) =>
    collection.getFilteredByGlob("src/posts/*.md").reverse()
  );

  eleventyConfig.addFilter("readableDate", (d) =>
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(d)
  );

  /* The year to show in the timeline's sticky chapter marker before
     any scrolling happens — the first month that actually has
     anything in it. */
  eleventyConfig.addFilter("firstYear", (months) => {
    const firstDated = months.find((month) => !month.isEmpty);
    return firstDated ? firstDated.year : (months[0] ? months[0].year : "");
  });

  /* Formats a "YYYY-MM-DD" string (as authored in timelinePhotos.json)
     without going through JS Date parsing quirks in templates. */
  eleventyConfig.addFilter("prettyDate", (isoDate) => {
    if (!isoDate) return "";
    const [y, m, day] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, day)));
  });

  /* {% image "antiques", "alt text here", "70vw" %}
     Looks for src/assets/images/originals/antiques.(jpg|jpeg|png|webp),
     makes nine sized/formatted copies, writes the <picture> markup.

     {% image "kitchen", "alt text here", "220px", photo.folder %}
     Timeline photos pass a 4th argument — their own "bundle" value,
     or "" if they don't have one — and look in
     src/assets/images/timeline/{folder}/kitchen.* (or, with "",
     directly in src/assets/images/timeline/kitchen.*) instead, so
     photos in different bundles can reuse the same filename. This is
     set automatically per-photo by timelineTrack.js; you never write
     it in timelinePhotos.json yourself.

     If the original isn't there yet, it prints a warning and drops a
     visible placeholder rather than killing the build — so you can add
     photos one at a time without everything falling over. */
  eleventyConfig.addAsyncShortcode("image", async (slug, alt, sizes = "100vw", folder) => {
    if (alt === undefined) {
      throw new Error(
        `Missing alt text for image "${slug}". Every image needs a description.`
      );
    }

    const original = findOriginal(slug, folder);

    if (!original) {
      const expected = folder === undefined
        ? `${ORIGINALS}/${slug}.*`
        : folder
          ? `${TIMELINE_IMAGES}/${folder}/${slug}.*`
          : `${TIMELINE_IMAGES}/${slug}.*`;
      console.warn(`[images] No original found for "${slug}" — expected ${expected}. Placeholder used.`);
      return `<div class="image-missing" role="img" aria-label="${alt}">
        <span>Missing image</span><code>${folder ? folder + "/" : ""}${slug}.jpg</code></div>`;
    }

    const metadata = await eleventyImage(original, {
      widths: [400, 800, 1600],
      formats: ["avif", "webp", "jpeg"],
      outputDir: "./_site/assets/generated/",
      urlPath: "/assets/generated/",
      sharpAvifOptions: { quality: 55 },
      sharpWebpOptions: { quality: 78 },
      sharpJpegOptions: { quality: 80, mozjpeg: true },
    });

    return generateHTML(metadata, {
      alt,
      sizes,
      loading: "lazy",
      decoding: "async",
    });
  });

  /* {% floater "background3", { top: "8vh", left: "4vw", width: "220px",
        rotate: "-6deg", speed: 0.35, z: 1 } %}

     Decorative, scattered background images for the index page. The
     source files in floaters/ are full-resolution scan dumps (some
     several MB) — this always downsizes them to a single small webp,
     since they only ever appear faded and shrunk behind the text. */
  eleventyConfig.addAsyncShortcode("floater", async (slug, opts = {}) => {
    const original = findFloater(slug);

    if (!original) {
      console.warn(`[floaters] No image found for "${slug}" — expected ${FLOATERS}/${slug}.jpg (or .png).`);
      return "";
    }

    const metadata = await eleventyImage(original, {
      widths: [480],
      formats: ["webp"],
      outputDir: "./_site/assets/generated/",
      urlPath: "/assets/generated/",
      sharpWebpOptions: { quality: 60 },
    });

    const img = metadata.webp[0];
    const top = opts.top || "0";
    const left = opts.left || "0";
    const width = opts.width || "220px";
    const rotate = opts.rotate || "0deg";
    const speed = opts.speed !== undefined ? opts.speed : 0.4;
    const z = opts.z !== undefined ? opts.z : 1;
    const style = `top:${top}; left:${left}; z-index:${z}; --floater-w:${width}; --floater-rotate:${rotate};`;

    return `<img class="floater" src="${img.url}" width="${img.width}" height="${img.height}" style="${style}" data-speed="${speed}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
