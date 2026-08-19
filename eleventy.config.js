import eleventyImage, { generateHTML } from "@11ty/eleventy-img";
import fs from "node:fs";
import path from "node:path";

const ORIGINALS = "src/assets/images/originals";
const FLOATERS = "src/assets/images/floaters";
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"];

function findOriginal(slug) {
  for (const ext of EXTENSIONS) {
    const p = path.join(ORIGINALS, slug + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
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

  /* {% image "antiques", "alt text here", "70vw" %}
     Looks for src/assets/originals/antiques.jpg (or .png, .jpeg),
     makes nine sized/formatted copies, writes the <picture> markup.

     If the original isn't there yet, it prints a warning and drops a
     visible placeholder rather than killing the build — so you can add
     photos one at a time without everything falling over. */
  eleventyConfig.addAsyncShortcode("image", async (slug, alt, sizes = "100vw") => {
    if (alt === undefined) {
      throw new Error(
        `Missing alt text for image "${slug}". Every image needs a description.`
      );
    }

    const original = findOriginal(slug);

    if (!original) {
      console.warn(
        `[images] No original found for "${slug}" — expected ${ORIGINALS}/${slug}.jpg (or .png). Placeholder used.`
      );
      return `<div class="image-missing" role="img" aria-label="${alt}">
        <span>Missing image</span><code>originals/${slug}.jpg</code></div>`;
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
