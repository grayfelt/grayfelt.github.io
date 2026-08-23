/* ============================================================
   timelineTrack.js
   Builds a vertical, month-by-month timeline: for each calendar
   month (including empty ones, so the sidebar tick never skips a
   beat) a "month block" containing bundles, standalone photos, and
   text notes, each positioned by day-of-month on the y axis and a
   scattered percentage on the x axis.

   AUTHORING MODEL — designed to stay cheap at hundreds of photos:
   Every photo in timelinePhotos.json only needs slug/date/caption.
     - Two or more photos in the same calendar month automatically
       become one bundle (a "pile" the visitor opens to fan out).
     - A month with exactly one photo automatically becomes a
       standalone card instead of a one-photo bundle.
   That default requires zero extra fields. Optional per-photo
   overrides, for the rare photo that needs one:
     "standalone": true   — pull this photo out of its month's
                             bundle into its own standalone card,
                             even if siblings remain.
     "bundle": ""          — explicitly "no bundle": always standalone,
                             same as "standalone": true, even if other
                             "bundle": "" photos share its month. Use
                             this (rather than just omitting "bundle")
                             whenever you don't want a photo swept into
                             an auto month-bundle alongside other
                             blank-bundle photos from the same month.
     "bundle": "some-key" — group with other photos sharing the same
                             custom key instead of by month (for a
                             trip that crosses a month boundary, OR
                             for splitting one month into several
                             bundles: give each cluster of photos its
                             own "bundle" key, e.g. "2022-09-arrival"
                             and "2022-09-flat", and both land in the
                             September 2022 month block side by side,
                             each positioned by its own date range).
     "cover": true         — use this photo as the bundle's cover
                             (top of the pile). Defaults to the
                             earliest photo in the bundle.
     "detail": "..."       — longer text shown in the single-photo
                             view. Defaults to the caption.
     "size"/"tilt"/"x"/"y"/"z" — manual layout overrides for a
                             photo's spot once its bundle is opened;
                             omit and they're derived from a hash of
                             the photo, so the same photo always
                             lands in the same spot without being
                             authored.
   Bundle titles/subtitles can be overridden per key in
   timelineBundles.json — the key is whatever grouped the bundle (a
   plain "YYYY-MM" for a month-grouped bundle, or your own custom
   "bundle" string, e.g. "2022-09-arrival"); every bundle works fine
   without an entry there too (title = month name or date range,
   subtitle = "N photos").

   WHERE THE ACTUAL IMAGE FILES LIVE:
   "slug" is just a filename (with or without its extension — both
   "kitchen" and "kitchen.jpg" work). A photo's own "bundle" field
   (if it has one) is stamped onto it here as "folder" and passed
   through to {% image %} in timeline.njk, which looks the file up at
   src/assets/images/timeline/{folder}/{slug}.*. That means two
   photos in different bundles can share the same filename (e.g. two
   "kitchen.jpg", one under Arrival/, one under NewFlat/) without
   colliding — you never set "folder" yourself, it's always exactly
   the photo's own "bundle" value. A photo with NO "bundle" field
   (including one that got auto-grouped into a month-bundle purely by
   sharing a month with others) has no folder either — its image is
   looked up directly in src/assets/images/timeline/, not in a
   month-named subfolder.

   LAYOUT MODEL:
   Every bundle/single card is placed by the day-of-month of its
   (earliest) date; a bundle spanning several days still anchors on
   its first day. Bundles and photos are free to overlap each other
   on both axes — that's the point of a "pile" aesthetic — but a
   text note always gets a clear vertical buffer above and below it
   so it stays legible, which can push later items in that month
   down (and grow the month block) to make room. A month with
   nothing in it collapses to a minimal height; its tick still shows
   on the sidebar.
   ============================================================ */
import photos from "./timelinePhotos.json" with { type: "json" };
import bundleMeta from "./timelineBundles.json" with { type: "json" };
import notes from "./timelineNotes.json" with { type: "json" };

const SIZE_CYCLE = ["sm", "sm", "md", "md", "md", "lg"];
const MONTH_KEY = /^\d{4}-\d{2}$/;

// ---- vertical rhythm constants (all in rem) ----
const DAY_UNIT = 1.05; // baseline space allotted per day-of-month
const MONTH_TOP_PAD = 1.4;
const MONTH_BOTTOM_PAD = 2.2;
const NOTE_GAP = 3.4; // required clear space directly above/below a note
const NOTE_RESERVE = 3.8; // assumed footprint of a note, for gap math
// A bundle's visual footprint is the 7.8rem stack + ~0.5rem flex gap
// + up to ~2 lines of caption text below it (see .bundle-stack /
// .bundle-caption in timeline.css) — this has to track that CSS by
// hand since nothing here measures the real rendered size. Keep the
// two in sync if the stack/peek sizing ever changes again.
const ITEM_RESERVE = 12.5; // assumed footprint of a bundle/single card, caption included
// The allowed overlap must stay within the image portion of that
// footprint (roughly the first 8rem: stack + gap) and never reach
// into the ~2.5rem caption line(s) at the bottom, or captions get
// covered by whatever overlaps next — so this has to stay well under
// ITEM_RESERVE minus that caption allowance.
const ITEM_OVERLAP = 2; // how much of a card's footprint the next one may cover, so captions stay clear
const MONTH_EMPTY_HEIGHT = 3.2; // a month with nothing in it: tick only
// Percent-based, but card widths are fixed rem — on a narrow phone
// viewport the content column can shrink well below the ~9.5rem a
// bundle caption needs, so this has to be generous enough that two
// overlapping-height beats land closer to opposite thirds of the
// column rather than just nudged apart.
const MIN_X_GAP = 42;

// Fan-out dialog reference size (rem) — matches .bundle-dialog's own
// width in timeline.css, and its height minus the header's rough
// footprint (the fan-area is what's left after the title/subtitle
// block). Only used to convert the percent-based x/y into a
// consistent unit for spacing math.
const FAN_W = 76;
const FAN_H = 45;
const FAN_GAP = 1.3; // rem, minimum clear space between two fanned photos' edges
const FAN_RADIUS = { sm: 3.9, md: 4.9, lg: 6.5 }; // ~half of each card size, for collision math

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* mulberry32: tiny seedable PRNG. Same seed -> same sequence, so a
   photo's "random" layout is stable across rebuilds. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(...parts) {
  return mulberry32(hashString(parts.join("|")));
}

function ymd(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function monthLabel(isoDate) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(ymd(isoDate));
}
function shortLabel(monthKey) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(ymd(monthKey + "-01"));
}
function shortDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(ymd(isoDate));
}
function dateRangeLabel(minDate, maxDate) {
  return minDate === maxDate ? shortDate(minDate) : `${shortDate(minDate)} – ${shortDate(maxDate)}`;
}
function dayOf(isoDate) {
  return Number(isoDate.slice(8, 10));
}
function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}`;
}

/* Horizontal spot for a card within its month block. Anchored to
   where its date (or, for a bundle, the midpoint of its date range)
   falls within the month, so several bundles sharing a month read
   left-to-right in date order instead of landing at random — with a
   small deterministic jitter on top so they don't sit in a dead
   straight line. Percent-based so it holds up at any viewport size. */
function xFor(key, dayFraction) {
  const jitter = (rngFor("track-x", key)() - 0.5) * 22;
  return +Math.min(90, Math.max(10, 16 + dayFraction * 68 + jitter)).toFixed(1);
}

/* The tiny "peek" pile shown on a bundle card — at most three real
   photos standing in for the whole bundle. The cover is last in the
   list (and last in the DOM), so it naturally sits on top. */
function peekLayout(photo, index, key, isCover) {
  const rand = rngFor("peek", key, photo.slug, photo.date);
  const tiltRange = isCover ? 6 : 18;
  return {
    ...photo,
    folder: photo.bundle || "",
    x: +((rand() - 0.5) * 1.92).toFixed(2),
    y: +((rand() - 0.5) * 1.44).toFixed(2),
    tilt: +((rand() - 0.5) * tiltRange).toFixed(1),
    z: index + 1,
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/* A photo's size/tilt/z, plus an unrelaxed starting x/y, all derived
   from a hash of the photo so they're stable across rebuilds. The
   starting x/y is just a seed for relaxFanPositions below — on its
   own it can land two photos on top of each other. */
function fanLayoutBase(photo) {
  const rand = rngFor("fan", photo.slug, photo.date);
  const size = photo.size || SIZE_CYCLE[Math.floor(rand() * SIZE_CYCLE.length)];
  return {
    ...photo,
    size,
    x0: photo.x !== undefined ? photo.x : +(6 + rand() * 68).toFixed(1),
    y0: photo.y !== undefined ? photo.y : +(10 + rand() * 60).toFixed(1),
    pinned: photo.x !== undefined && photo.y !== undefined,
    tilt: photo.tilt !== undefined ? photo.tilt : +((rand() - 0.5) * 14).toFixed(1),
    z: photo.z !== undefined ? photo.z : Math.floor(rand() * 5) + 1,
  };
}

/* Where a single standalone photo's "photo" object needs a size/tilt
   (its x/y here are never actually used in the template — a single
   card is positioned on the main track by the beat's own x/y). */
function fanLayout(photo) {
  const base = fanLayoutBase(photo);
  return { ...base, x: base.x0, y: base.y0 };
}

/* Spreads a bundle's fanned-out photos apart so they don't pile on
   top of each other: converts each photo's seed x/y (percent) into
   rem using the fan dialog's own reference size, then repeatedly
   pushes apart any pair closer than their combined radii + a gap,
   same idea as circle-packing relaxation. A photo with an authored
   "x"/"y" (pinned) never moves, but still pushes others away from it. */
function relaxFanPositions(bases) {
  const pts = bases.map((b) => ({
    x: (b.x0 / 100) * FAN_W,
    y: (b.y0 / 100) * FAN_H,
    r: FAN_RADIUS[b.size] || FAN_RADIUS.md,
    pinned: b.pinned,
  }));

  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        if (a.pinned && b.pinned) continue; // both fixed — nothing to resolve

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.r + b.r + FAN_GAP;
        if (dist >= minDist) continue;
        moved = true;
        if (dist < 0.001) {
          // identical seed positions: nudge apart deterministically
          dx = 0.1; dy = 0.1; dist = Math.sqrt(0.02);
        }
        const ux = dx / dist, uy = dy / dist;
        const shortfall = minDist - dist;
        // whichever side isn't pinned absorbs the full correction on
        // its own; if neither is pinned, split it evenly
        const aShare = a.pinned ? 0 : b.pinned ? 1 : 0.5;
        const bShare = b.pinned ? 0 : a.pinned ? 1 : 0.5;
        a.x -= ux * shortfall * aShare; a.y -= uy * shortfall * aShare;
        b.x += ux * shortfall * bShare; b.y += uy * shortfall * bShare;
      }
    }
    for (const p of pts) {
      if (p.pinned) continue;
      // clamp by this card's OWN radius, not a flat margin — otherwise
      // a large card centered near the edge still pokes outside it
      p.x = clamp(p.x, p.r, FAN_W - p.r);
      p.y = clamp(p.y, p.r, FAN_H - p.r);
    }
    if (!moved) break;
  }

  return pts.map((p) => ({
    x: +((p.x / FAN_W) * 100).toFixed(1),
    y: +((p.y / FAN_H) * 100).toFixed(1),
  }));
}

function buildEntry(key, groupPhotos) {
  const sorted = [...groupPhotos].sort((a, b) => a.date.localeCompare(b.date));
  const minDate = sorted[0].date;
  const maxDate = sorted[sorted.length - 1].date;
  const monthKey = minDate.slice(0, 7);
  const day = dayOf(minDate);
  const days = daysInMonth(monthKey);
  // a bundle's x comes from the midpoint of its date range; a single
  // photo just uses its one date.
  const midDay = (dayOf(minDate) + dayOf(maxDate)) / 2;
  const dayFraction = (midDay - 1) / Math.max(days - 1, 1);
  const x = xFor(key, dayFraction);

  if (sorted.length === 1) {
    const photo = sorted[0];
    return {
      type: "single",
      key,
      date: photo.date,
      monthKey,
      day,
      x,
      photo: {
        ...fanLayout(photo),
        folder: photo.bundle || "",
        tilt: photo.tilt !== undefined ? photo.tilt : +((rngFor("single-tilt", key, photo.slug)() - 0.5) * 10).toFixed(1),
      },
    };
  }

  const cover = sorted.find((p) => p.cover) || sorted[0];
  const others = sorted.filter((p) => p !== cover).slice(0, 2);
  const peekOrder = [...others, cover]; // cover last -> sits on top
  const meta = bundleMeta[key] || {};
  const isMonthKey = MONTH_KEY.test(key);

  const fanBases = sorted.map((p) => fanLayoutBase(p));
  const relaxed = relaxFanPositions(fanBases);
  const fannedPhotos = fanBases.map((b, i) => ({
    ...b,
    x: relaxed[i].x,
    y: relaxed[i].y,
    fanIndex: i,
    folder: b.bundle || "",
  }));

  return {
    type: "bundle",
    key,
    date: minDate,
    monthKey,
    day,
    x,
    title: meta.title || (isMonthKey ? monthLabel(minDate) : dateRangeLabel(minDate, maxDate)),
    subtitle: meta.subtitle || `${sorted.length} photos`,
    count: sorted.length,
    peek: peekOrder.map((p, i) => peekLayout(p, i, key, p === cover)),
    photos: fannedPhotos,
  };
}

// ---- split out anything forced standalone, then group the rest ----
// An explicit "bundle": "" means "definitely no bundle" and forces a
// standalone card, same as "standalone": true — distinct from simply
// omitting "bundle", which still auto-groups by month.
const isForcedStandalone = (p) => p.standalone || p.bundle === "";
const forcedSingles = photos.filter(isForcedStandalone);
const groupable = photos.filter((p) => !isForcedStandalone(p));

const groups = new Map();
for (const photo of groupable) {
  const key = photo.bundle || photo.date.slice(0, 7);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(photo);
}

const entries = [];
for (const photo of forcedSingles) {
  entries.push(buildEntry(photo.date.slice(0, 7), [photo]));
}
for (const [key, groupPhotos] of groups) {
  entries.push(buildEntry(key, groupPhotos));
}
const entriesByKey = new Map(entries.map((e) => [e.key, e]));

// ---- resolve each note to a month + day, anchored just after whatever it follows ----
const resolvedNotes = notes.map((note, i) => {
  const anchorKey = note.after || "";
  const anchorEntry = entriesByKey.get(anchorKey);
  let monthKey;
  let day;
  if (anchorEntry) {
    monthKey = anchorEntry.monthKey;
    day = Math.min(anchorEntry.day + 3, daysInMonth(monthKey));
  } else if (MONTH_KEY.test(anchorKey)) {
    monthKey = anchorKey;
    day = 15;
  } else {
    monthKey = entries.length ? entries[0].monthKey : shiftMonth("1970-01", 0);
    day = 1;
  }
  return { type: "note", key: `note-${i}`, text: note.text, monthKey, day, x: 50 };
});

// ---- group entries + notes by month ----
const monthMap = new Map();
function bucket(monthKey) {
  if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
  return monthMap.get(monthKey);
}
for (const entry of entries) bucket(entry.monthKey).push(entry);
for (const note of resolvedNotes) bucket(note.monthKey).push(note);

// ---- full contiguous month range, so empty months still get a tick ----
const allMonthKeys = [...monthMap.keys()].sort();
const firstMonthKey = allMonthKeys[0];
const lastMonthKey = allMonthKeys[allMonthKeys.length - 1];

const months = [];
if (firstMonthKey && lastMonthKey) {
  let cursor = firstMonthKey;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    months.push(cursor);
    if (cursor === lastMonthKey) break;
    cursor = shiftMonth(cursor, 1);
  }
}

/* Lay a month's beats out top-to-bottom: entries scatter by day and
   are allowed to partially overlap each other (that's the point of
   a "pile" aesthetic) — but never fully enough to bury a caption, so
   every beat is nudged down until at most ITEM_OVERLAP of the
   previous one's footprint is covered. Any beat touching a note
   (the note itself, or whatever comes right before/after one) gets
   the much stricter NOTE_GAP instead — no overlap at all. Both can
   grow the month's total height past its day-count baseline. */
function layoutMonth(monthKey, beats) {
  if (!beats.length) {
    return { height: MONTH_EMPTY_HEIGHT, beats: [] };
  }

  const days = daysInMonth(monthKey);
  const span = days * DAY_UNIT;
  const ordered = [...beats].sort((a, b) => a.day - b.day);

  let shift = 0;
  let lastBottom = 0;
  let lastWasNote = false;
  const laidOut = [];

  for (const beat of ordered) {
    const baseY = MONTH_TOP_PAD + ((beat.day - 1) / Math.max(days - 1, 1)) * span;
    let y = baseY + shift;

    if (laidOut.length) {
      const minY = beat.type === "note" || lastWasNote
        ? lastBottom + NOTE_GAP
        : lastBottom - ITEM_OVERLAP;
      if (y < minY) {
        const delta = minY - y;
        shift += delta;
        y += delta;
      }
    }

    const ownHeight = beat.type === "note" ? NOTE_RESERVE : ITEM_RESERVE;
    lastBottom = Math.max(lastBottom, y + ownHeight);
    lastWasNote = beat.type === "note";
    laidOut.push({ ...beat, y: +y.toFixed(2) });
  }

  spreadBeatsHorizontally(laidOut);

  const height = +(Math.max(MONTH_TOP_PAD + span, lastBottom) + MONTH_BOTTOM_PAD).toFixed(2);
  return { height, beats: laidOut };
}

/* Two beats whose vertical spans overlap (typically: same day, or
   close enough after the ITEM_OVERLAP nudge above) can still land
   close together on x by chance, since x is otherwise independent of
   y. This pushes any such pair apart symmetrically until they clear
   MIN_X_GAP, mutating beat.x in place. Notes are left out — they
   already get a hard vertical gap from everything else, so they're
   never close enough on y to need this. Runs a few passes so a
   three-or-more-way cluster settles rather than just resolving one
   pair and leaving the others still touching. */
function spreadBeatsHorizontally(beats) {
  const movable = beats.filter((b) => b.type !== "note");
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i], b = movable[j];
        const aHeight = ITEM_RESERVE;
        const bHeight = ITEM_RESERVE;
        const vOverlap = a.y < b.y + bHeight && b.y < a.y + aHeight;
        if (!vOverlap) continue;
        const dx = b.x - a.x;
        const dist = Math.abs(dx);
        if (dist >= MIN_X_GAP) continue;
        moved = true;
        const dir = dx === 0 ? (a.key < b.key ? -1 : 1) : Math.sign(dx);
        const push = (MIN_X_GAP - dist) / 2;
        a.x = clamp(a.x - dir * push, 8, 92);
        b.x = clamp(b.x + dir * push, 8, 92);
      }
    }
    if (!moved) break;
  }
}

const timelineMonths = months.map((monthKey, monthIndex) => {
  const { height, beats } = layoutMonth(monthKey, monthMap.get(monthKey) || []);
  beats.forEach((beat, i) => { beat.domKey = `${monthKey}-${i}`; });
  return {
    key: monthKey,
    year: monthKey.slice(0, 4),
    label: monthLabel(monthKey + "-01"),
    shortLabel: shortLabel(monthKey),
    isEmpty: beats.length === 0,
    height,
    beats,
    domKey: `month-${monthIndex}`,
  };
});

export default timelineMonths;
