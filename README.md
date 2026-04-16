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

- WordPress 6.3+
- PHP 8.0+
- Node.js 18+ / npm 9+ (development only)

---

## Architecture Decisions

### 1. Inter-Block Communication: `CustomEvent` on `document`

This was the central design question. The filter and grid blocks must stay in sync without being nested inside each other.

**What I chose:** a `CustomEvent` bus dispatched on `document`.

When the user toggles a filter, `PostsFilter` fires:

```js
document.dispatchEvent(new CustomEvent('nrpb:filter-change', {
  detail: { blockId, categories: [...], tags: [...] }
}));
```

`PostsGrid` listens and re-fetches:

```js
document.addEventListener('nrpb:filter-change', (e) => {
  if (e.detail.blockId !== this.blockId) return;
  this.fetchPosts();
});
```

The `blockId` attribute is assigned from the block's `clientId` on first render and serialized into the block markup. This lets multiple filter+grid pairs coexist on the same page independently.

**Why not the alternatives:**

| Approach | Why ruled out |
|----------|---------------|
| **URL query params** | Requires a full page reload. Breaks if the grid is not the primary content. Pollutes the browser history. |
| **Shared parent / InnerBlocks nesting** | Forces a rigid DOM hierarchy. The brief explicitly requires independent placement. |
| **`wp.data` store** | Only available inside the block editor. Not accessible on the frontend without a full React tree. |
| **`localStorage` / `sessionStorage`** | No native broadcast to same-tab listeners without polling. Also persists across pages unintentionally. |
| **URL hash / `history.pushState`** | Same reload problem as query params for SSR content. Adds complexity with no benefit. |
| **Shared React context / Redux** | Would require a shared root component wrapping both blocks — effectively the same constraint as a shared parent. |

**Tradeoffs of `CustomEvent`:**
- Pro: synchronous, zero dependencies, works anywhere in the DOM regardless of block placement.
- Pro: multiple isolated pairs work automatically via `blockId` matching.
- Con: communication is one-directional (filter → grid). If you needed grid-to-filter sync (e.g. back/forward navigation restoring filter state), you'd need to extend this or add URL state.
- Con: not persistent across page loads — filters reset on navigation.

---

### 2. Dynamic Blocks with PHP `render_callback`

All three blocks use PHP render callbacks instead of JavaScript `save()` output.

**Why:** the grid content is inherently dynamic — it depends on the current filter state, pagination, and live post data. A static `save()` function would go stale the moment a post is updated, deleted, or recategorised. WordPress would mark the block as invalid on every edit. Dynamic rendering solves this at the root.

**Tradeoff:** dynamic blocks are slightly slower than static blocks because they execute a database query on every page load. For a posts grid this is expected and appropriate. The query is a standard `WP_Query` with no unbounded joins.

**`save()` convention used:**
- `posts-grid`: returns `<InnerBlocks.Content />` — only the inner block markup is stored in `post_content`. The PHP callback provides the outer wrapper.
- `posts-filter`: returns `null` — fully server-rendered.
- `pagination`: returns `null` — fully server-rendered, populated by the frontend JS after each fetch.

---

### 3. Pagination as an Inner Block

The brief requires pagination to be an inner block of the grid. This was implemented with a locked `templateLock="all"` so the pagination block cannot be removed or reordered in the editor, but is always present.

**Why inner block instead of a block attribute:** the brief specified it. Beyond compliance, it makes the pagination visually discoverable in the editor's block tree and opens the door to letting editors swap in a custom pagination style in the future.

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

**Tradeoff:** maintaining a custom endpoint adds surface area. If WordPress core changes how `WP_Query` handles `tax_query`, we own that upgrade path. For this scope it's the right call.

---

### 5. Build System: Custom Webpack over `@wordpress/scripts`

**What I chose:** a hand-written `webpack.config.js` instead of the official `@wordpress/scripts` package.

**Why:** `@wordpress/scripts` abstracts away the build config entirely, which makes it fast to start but hard to extend. For this project I needed explicit control over:
- Multiple entry points compiled to a flat `build/` directory
- A custom `WordPressAssetPlugin` that generates `.asset.php` files with correct dependency arrays
- A `CopyWebpackPlugin` pass that rewrites `block.json` file paths for the build target
- Sass with the modern API

**Tradeoff:** `@wordpress/scripts` would have handled the `.asset.php` generation automatically and would track WordPress package version changes in its own dependency tree. With a custom config, keeping WordPress package versions in sync is a manual concern.

---

### 6. SVG Placeholder Images Generated on Activation

Featured images are generated programmatically as SVG files with a gradient background, decorative circles, and a text label. They are registered as real WordPress attachments.

**Why:** no external HTTP requests, no binary files committed to the repository, no dependency on a CDN. The images are created exactly once at activation time and live in the WordPress uploads directory like any other media.

**Known limitation:** SVG files are not rasterised by WordPress. `wp_get_attachment_image_url()` returns the SVG URL correctly, but WordPress will not generate intermediate sizes (`thumbnail`, `medium`, etc.) for SVGs. The frontend requests `medium_large` as the size hint, which falls back to the original SVG — fine for a demo, but not production-ready for themes that expect pixel-based srcset.

---

## Known Limitations

| Area | Limitation |
|------|------------|
| **Filter state** | Not persisted in the URL. Using the browser back button after filtering resets the grid to page 1 with no active filters. |
| **SEO** | Filtered results are not crawlable. The initial server-rendered grid (no filters applied) is fully SEO-friendly; filtered states are client-side only. |
| **Accessibility** | Filter changes trigger a live region update via `aria-busy` on the grid, but a proper `aria-live` region announcing result counts is not implemented. |
| **SVG images** | WordPress does not generate srcset for SVG attachments. Real content should use JPEG/WebP images. |
| **Pagination + filters** | Changing filters resets to page 1 (correct), but the page number is not reflected in the URL, so sharing a deep-paginated filtered view is not possible. |
| **No server-side filter render** | The first server render always shows all posts. Filters only activate after the JS loads. This is a standard tradeoff for client-side filtering; progressive enhancement via URL params would address it. |

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
│   │   ├── index.js             # DOMContentLoaded — mounts PostsGrid + PostsFilter
│   │   ├── posts-grid.js        # Fetch, render cards, render pagination, handle filter events
│   │   ├── posts-filter.js      # Toggle state, dispatch nrpb:filter-change CustomEvent
│   │   └── style.scss           # Entry point — imports all partials in order
│   └── styles/
│       ├── _variables.scss      # CSS custom properties + SCSS build-time constants
│       ├── _mixins.scss         # respond-up/down, focus-ring, line-clamp, flex helpers
│       ├── _layout.scss         # Page gutter (2rem), grid columns, breakpoints
│       ├── _filter.scss         # Filter bar component
│       ├── _card.scss           # Post card component
│       ├── _pagination.scss     # Pagination buttons
│       └── _editor.scss         # Editor-only hints
├── build/                       # Webpack output (gitignored)
├── webpack.config.js            # Custom build: entries, externals, asset.php generation, block.json copy
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
      "categories": [3, 5],
      "tags": [7]
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
