import eleventyImage, { generateHTML } from "@11ty/eleventy-img";
import fs from "node:fs";
import path from "node:path";

const ORIGINALS = "src/assets/images/originals";
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"];

function findOriginal(slug) {
  for (const ext of EXTENSIONS) {
    const p = path.join(ORIGINALS, slug + ext);
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
