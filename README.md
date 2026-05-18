# NR Posts Blocks

A WordPress plugin that registers two custom Gutenberg blocks — **Posts Grid** and **Posts Filter** — and seeds all demo content automatically on activation. No manual setup required beyond installation.

---

## Quick Start

```bash
# From source
cd wp-content/plugins/nr-posts-blocks
npm install && npm run build
```

Activate the plugin in **WP Admin → Plugins**. A demo page is created automatically at `/nrpb-demo` with both blocks pre-placed and ready to use.

**Pre-built option:** if `build/` is included in the repository, skip the npm steps entirely.

---

## What Gets Created on Activation

| Type | Count | Details |
|------|-------|---------|
| Categories | 4 | Technology, Design, Business, Science |
| Tags | 8 | Tutorial, Tips, Tools, Trends, Beginner, Advanced, Case Study, Inspiration |
| Posts | 12 | Each with title, excerpt, SVG featured image, and multiple term assignments |
| Demo page | 1 | `/nrpb-demo` — both blocks pre-placed with shared `blockId` |

All seeded slugs are prefixed with `nrpb-` to avoid collisions. A `nrpb_seeded_v1` option flag prevents the seeder from running more than once.

---

## Requirements

- WordPress 6.6+ (Interactivity API stable)
- PHP 8.0+
- Node.js 18+ / npm 9+ (development only)

---

## Architecture Decisions

### 1. Inter-Block Communication: WordPress Interactivity API

This was the central design question. The filter and grid blocks must stay in sync without being nested inside each other.

**What I chose:** the [WordPress Interactivity API](https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/), introduced in WordPress 6.5.

All frontend logic lives in `src/interactivity/view.js`, registered as a Script Module (`viewScriptModule` in `block.json`). The store is namespaced `nrpb` and exposes `state`, `actions`, and `callbacks`.

**State shape — keyed by `blockId`:**

```js
// Seeded from PHP via wp_interactivity_state() in each block's render callback.
state.filters[blockId] = { categories: [], tags: [], page: 1 }
state.grids[blockId]   = { postsPerPage: 6, totalPages: 1 }
state.loadingBlocks    = []   // array of blockIds currently fetching
```

Keying by `blockId` means multiple Filter + Grid pairs on the same page are fully isolated — the same guarantee that the previous `CustomEvent` approach provided via `blockId` matching.

**Data flow:**

1. The user clicks a filter button (`data-wp-on--click="actions.toggleFilter"`).
2. `toggleFilter` reads `blockId`, `filterId`, and `filterType` from the button's `data-wp-context`.
3. `state.filters[blockId]` is mutated in-place — spread replacement would orphan Preact signal subscriptions and break reactive directives.
4. `data-wp-class--is-active` and `data-wp-class--is-visible` directives react automatically to the state change — no imperative DOM manipulation.
5. `_syncFilterURL(blockId)` writes the selection to `?nrpb_categories=…&nrpb_tags=…` via `history.replaceState`.
6. `_fetchPosts(blockId)` cancels any in-flight request for the same `blockId` with an `AbortController`, then fetches the REST endpoint and re-renders posts and pagination.

**URL params (preserved across page loads and back/forward navigation):**

| Param | Type | Example |
|-------|------|---------|
| `nrpb_categories` | Comma-separated term IDs | `?nrpb_categories=3,5` |
| `nrpb_tags` | Comma-separated term IDs | `?nrpb_tags=7` |
| `nrpb_page` | Integer | `?nrpb_page=2` |

On mount (`callbacks.initFilter`, `callbacks.initGrid`) the store reads these params and restores filter + page state before the first fetch. The `popstate` listener keeps state in sync when the user navigates with the browser's back/forward buttons.

**Multi-pair support — automatic DOM-order pairing:**

Multiple Filter + Grid pairs on the same page are supported with zero editor configuration. The PHP render callbacks use two independent static counters (`$filter_index`, `$grid_index`). On each page request the Nth filter and the Nth grid receive the same pair key (`nrpb-pair-0`, `nrpb-pair-1`, …), regardless of what is stored in the block's `blockId` attribute. This means placing a second Filter + Grid pair anywhere on the page just works — the editor never needs to copy or paste IDs.

The one assumption: the Nth filter in HTML order corresponds to the Nth grid in HTML order. In standard Gutenberg layouts this is always the case.

**Why not the alternatives:**

| Approach | Why ruled out |
|----------|---------------|
| **`CustomEvent` on `document`** | One-directional; no built-in URL persistence; filter state resets on page load. Replaced by the Interactivity API in this version. |
| **Shared parent / InnerBlocks nesting** | Forces a rigid DOM hierarchy. The brief explicitly requires independent block placement. |
| **`wp.data` store** | Only available inside the block editor. Not accessible on the frontend without a full React tree. |
| **`localStorage` / `sessionStorage`** | No native broadcast to same-tab listeners without polling. Persists across pages unintentionally. |
| **Shared React context / Redux** | Would require a shared root component wrapping both blocks — effectively the same constraint as a shared parent. |

**Tradeoffs of the Interactivity API:**
- Pro: first-party WordPress API; no external dependencies; survives theme switches.
- Pro: `data-wp-*` directives keep PHP templates declarative; logic stays in one JS file.
- Pro: URL params give full progressive enhancement — filtered views are shareable and survive hard reloads.
- Pro: `wp_interactivity_config()` / `getConfig()` replaces `wp_localize_script` — config travels with the block, not as a global window object.
- Con: requires WordPress 6.6+; not available on older installs without a polyfill.
- Con: State mutations must be in-place (`state.filters[blockId].categories = updated`). Replacing the entire object at the top level orphans Preact signal subscriptions and breaks reactive directives.
- Con: URL params (`nrpb_categories`, `nrpb_tags`, `nrpb_page`) are global — shared across all pairs on the same page. A full fix would require per-pair namespacing (e.g. `nrpb_0_categories`), which is a larger change.

---

### 2. Dynamic Blocks with PHP `render_callback`

All three blocks use PHP render callbacks instead of JavaScript `save()` output.

**Why:** the grid content is inherently dynamic — it depends on the current filter state, pagination, and live post data. A static `save()` function would go stale the moment a post is updated, deleted, or recategorised. WordPress would mark the block as invalid on every edit. Dynamic rendering solves this at the root.

**Tradeoff:** dynamic blocks are slightly slower than static blocks because they execute a database query on every page load. For a posts grid this is expected and appropriate. The query is a standard `WP_Query` with no unbounded joins.

**`save()` convention used:**
- `posts-grid`: returns `<InnerBlocks.Content />` — only the inner block markup is stored in `post_content`. The PHP callback provides the outer wrapper.
- `posts-filter`: returns `null` — fully server-rendered.
- `pagination`: returns `null` — fully server-rendered, replaced by JS-rendered HTML after each fetch.

---

### 3. Pagination as an Inner Block

The brief requires pagination to be an inner block of the grid. This was implemented with a locked `templateLock="all"` so the pagination block cannot be removed or reordered in the editor, but is always present.

**Why inner block instead of a block attribute:** the brief specified it. Beyond compliance, it makes the pagination visually discoverable in the editor's block tree and opens the door to letting editors swap in a custom pagination style in the future.

**Block context:** the grid passes `nrpb/postsPerPage` and `nrpb/blockId` to the pagination via `providesContext` / `usesContext`. `render_pagination()` reads both values from `$block->context`, making the parent–child relationship explicit at the PHP level.

**Progressive enhancement:** the PHP render outputs two pagination navs. The SSR nav is visible on first load and its buttons are fully interactive — each carries a `data-wp-context` with its target page and calls `actions.goToPage` directly, so pagination works without requiring a filter interaction first. After the first JS fetch the SSR nav hides and the dynamic nav (driven by `data-wp-each--btn`) takes over.

**Tradeoff:** the pagination block is not independently insertable (its `block.json` sets `"parent": ["nrpb/posts-grid"]` and `"inserter": false`). It only makes sense in context. This is intentional — a standalone pagination block with no grid attached is meaningless.

---

### 4. REST API Filtering Logic

**Endpoint:** `GET /wp-json/nrpb/v1/posts`

Filtering uses `WP_Query` with a `tax_query`:

```php
[
  'relation' => 'AND',
  ['taxonomy' => 'category', 'operator' => 'IN', 'terms' => $category_ids],
  ['taxonomy' => 'post_tag',  'operator' => 'IN', 'terms' => $tag_ids],
]
```

- `IN` within a taxonomy = **OR** across selected terms of the same type
- `AND` at the top level = a post must satisfy both the category clause and the tag clause

This matches the spec: *"OR within the same filter type, AND across filter types."*

**Why a custom endpoint instead of the core `/wp/v2/posts`:** the core endpoint supports `categories` and `tags` filtering but always applies AND logic between taxonomies when using multiple parameters. It also returns full post objects with unnecessary fields. A custom endpoint gives us explicit control over the tax_query logic and a lean response shape.

Response caching is handled inside the REST controller with `wp_cache_get` / `wp_cache_set` keyed by query parameters. The Interactivity API store hits this endpoint on every filter change; caching prevents redundant database queries for repeated param combinations.

**Tradeoff:** maintaining a custom endpoint adds surface area. If WordPress core changes how `WP_Query` handles `tax_query`, we own that upgrade path. For this scope it's the right call.

---

### 5. Build System: Two-Config Webpack

**What I chose:** a hand-written `webpack.config.js` with two separate Webpack configurations instead of the official `@wordpress/scripts` package.

**Config 1 — `main` (CommonJS/IIFE output):**
Compiles editor scripts (`posts-grid`, `posts-filter`, `pagination`) and the shared frontend CSS. Externalises all `@wordpress/*` packages against the global `wp.*` object. Emits `.asset.php` files with dependency arrays via a custom `WordPressAssetPlugin`.

**Config 2 — `interactivity` (ES module output):**
Compiles `src/interactivity/view.js` into an ES module (`type="module"`) required by the WordPress Script Modules API. `@wordpress/interactivity` is externalised — WordPress provides it via an import map at runtime. The block's `block.json` registers the output via `viewScriptModule`.

**Why not `@wordpress/scripts`:** `@wordpress/scripts` abstracts away the build config entirely, which makes it fast to start but hard to extend. For this project explicit control was needed over:
- The two-target output (IIFE + ES module)
- Custom `.asset.php` generation with exact dependency arrays
- A `CopyWebpackPlugin` pass that rewrites `block.json` file paths for the build target
- Sass with the modern API

**Tradeoff:** `@wordpress/scripts` would have handled `.asset.php` generation automatically and tracks WordPress package versions in its own dependency tree. With a custom config, keeping package versions in sync is a manual concern.

---

### 6. SVG Placeholder Images Generated on Activation

Featured images are generated programmatically as SVG files with a gradient background, decorative circles, and a text label. They are registered as real WordPress attachments.

**Why:** no external HTTP requests, no binary files committed to the repository, no dependency on a CDN. The images are created exactly once at activation time and live in the WordPress uploads directory like any other media.

**Known limitation:** SVG files are not rasterised by WordPress. `wp_get_attachment_image_url()` returns the SVG URL correctly, but WordPress will not generate intermediate sizes (`thumbnail`, `medium`, etc.) for SVGs. The frontend requests `medium_large` as the size hint, which falls back to the original SVG — fine for a demo, but not production-ready for themes that expect pixel-based srcset.

---

## Known Limitations

| Area | Limitation |
|------|------------|
| **SEO** | Filtered results are not crawlable. The initial server-rendered grid (no filters applied) is fully SEO-friendly; filtered states are client-side only. URL params allow search engines to index specific filtered views only if they execute JavaScript. |
| **Accessibility** | Filter changes announce result count via an `aria-live="polite"` region. A full `aria-live` announcement for individual result titles is not implemented. |
| **URL params (multi-pair)** | `nrpb_categories`, `nrpb_tags`, and `nrpb_page` are global query params shared across all pairs on the same page. With two pairs, navigating to page 2 on pair A also restores page 2 on pair B after a hard reload. Full fix requires per-pair param namespacing. |
| **SVG images** | WordPress does not generate srcset for SVG attachments. Real content should use JPEG/WebP images. |
| **WordPress version** | The Interactivity API requires WordPress 6.6+. Older installs are not supported without a polyfill. |

---

## Project Structure

```
nr-posts-blocks/
├── nr-posts-blocks.php          # Plugin header, constants, bootstrap, activation hook
├── includes/
│   ├── class-blocks.php         # Block registration, PHP render callbacks, asset enqueueing
│   ├── class-rest-api.php       # GET /nrpb/v1/posts — filtering, pagination, response shape
│   └── class-seeder.php         # Demo posts, terms, SVG images, demo page — runs once on activation
├── src/
│   ├── blocks/
│   │   ├── posts-grid/          # block.json, edit.js (InspectorControls), save.js, index.js
│   │   ├── posts-filter/        # block.json, edit.js (read-only preview), index.js
│   │   └── pagination/          # block.json, index.js (inner block, editor hint only)
│   ├── frontend/
│   │   ├── index.js             # Entry point (currently a no-op stub; logic lives in interactivity/)
│   │   └── style.scss           # Entry point — imports all partials in order
│   ├── interactivity/
│   │   └── view.js              # Interactivity API store: state, actions, callbacks for filter + grid
│   └── styles/
│       ├── _variables.scss      # CSS custom properties + SCSS build-time constants
│       ├── _mixins.scss         # respond-up/down, focus-ring, line-clamp, flex helpers
│       ├── _layout.scss         # Page gutter (2rem), grid columns, breakpoints
│       ├── _filter.scss         # Filter bar component
│       ├── _card.scss           # Post card component
│       ├── _pagination.scss     # Pagination buttons
│       └── _editor.scss         # Editor-only hints
├── build/                       # Webpack output (gitignored)
├── webpack.config.js            # Two-config build: IIFE for editor, ES module for interactivity view
├── package.json
├── .gitignore
└── README.md
```

---

## REST API Reference

**`GET /wp-json/nrpb/v1/posts`**

| Parameter | Type | Default | Constraint |
|-----------|------|---------|------------|
| `page` | int | 1 | > 0 |
| `posts_per_page` | int | 6 | 1–100 |
| `categories` | int[] | [] | Comma-separated IDs |
| `tags` | int[] | [] | Comma-separated IDs |

**Response:**
```json
{
  "posts": [
    {
      "id": 1,
      "title": "Post title",
      "excerpt": "Plain text excerpt",
      "permalink": "https://example.com/post-slug/",
      "thumbnail_url": "https://example.com/wp-content/uploads/image.svg",
      "thumbnail_alt": "",
      "categories": [
        { "id": 3, "name": "Technology", "slug": "nrpb-technology" }
      ],
      "tags": [
        { "id": 7, "name": "Tutorial", "slug": "nrpb-tutorial" }
      ]
    }
  ],
  "total": 12,
  "total_pages": 2,
  "page": 1
}
```

---

## Development

```bash
npm run start   # watch mode
npm run build   # production build
```
