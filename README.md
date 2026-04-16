# NR Posts Blocks

A WordPress plugin that registers two custom Gutenberg blocks — **Posts Grid** and **Posts Filter** — and seeds all demo content automatically on activation.

---

## Requirements

- WordPress 6.3+
- PHP 8.0+
- Node.js 18+ / npm 9+ (for development only)

---

## Installation & Setup

### Option A — Pre-built (no Node required)

1. Upload the plugin folder to `wp-content/plugins/nr-posts-blocks/`
2. Activate the plugin in **WP Admin → Plugins**
3. Done. Visit `/nrpb-demo` to see the demo page.

### Option B — From source

```bash
cd wp-content/plugins/nr-posts-blocks
npm install
npm run build
```

Then activate the plugin in WP Admin.

---

## What Gets Created on Activation

The seeder runs once on activation and creates:

| Type | Count | Details |
|------|-------|---------|
| Categories | 4 | Technology, Design, Business, Science |
| Tags | 8 | Tutorial, Tips, Tools, Trends, Beginner, Advanced, Case Study, Inspiration |
| Posts | 12 | Each with title, excerpt, featured image, and multiple term assignments |
| Demo page | 1 | `/nrpb-demo` — both blocks pre-placed and ready to use |

All seeded content uses the `nrpb-` prefix on slugs to avoid collisions with existing content.

---

## The Blocks

### Posts Grid (`nrpb/posts-grid`)

A dynamic block that fetches and renders posts via the REST API.

**Inspector Controls:**
- **Columns** — 2, 3, or 4 (default: 3)
- **Posts per page** — 2–12 (default: 6)

**Inner block:** `nrpb/pagination` is inserted automatically and handles page navigation on the frontend.

### Posts Filter (`nrpb/posts-filter`)

Renders category and tag filter pills. Both filter types support multiple simultaneous selections.

**Filtering logic:**
- OR within the same filter type (selecting "Design" + "Science" shows posts in either)
- AND across filter types (selecting "Design" + "Tutorial" shows posts that are in Design **and** tagged Tutorial)

### Placing the blocks

Both blocks can be placed **anywhere on the same page** — they do not need to be nested. They are linked by a shared `blockId` attribute that is set automatically when the block is first inserted.

---

## Inter-Block Communication

### Approach: `CustomEvent` bus on `document`

When the user toggles a filter, `PostsFilter` dispatches a `nrpb:filter-change` CustomEvent on `document`:

```js
document.dispatchEvent(new CustomEvent('nrpb:filter-change', {
  detail: { blockId, categories: [...], tags: [...] }
}));
```

`PostsGrid` listens for the same event and re-fetches posts from the REST API using the received filter state:

```js
document.addEventListener('nrpb:filter-change', (e) => {
  if (e.detail.blockId !== this.blockId) return;
  // fetch with new filters
});
```

The `blockId` is stored as a block attribute (derived from `clientId` in the editor and serialized to the markup). This allows multiple filter+grid pairs to coexist on the same page independently.

### Why not other approaches?

| Approach | Why it was ruled out |
|----------|----------------------|
| **URL query params** | Requires a page reload; pollutes the URL; breaks if the grid is not the primary content |
| **Shared parent / Inner Blocks** | Forces a rigid DOM hierarchy — the task explicitly requires independent placement |
| **WordPress data store (`wp.data`)** | Only available inside the editor; not accessible on the frontend without a full React tree |
| **localStorage / sessionStorage** | No native cross-component broadcast in the same tab without polling |
| **URL hash** | Same reload problem; hash changes do not trigger REST re-fetches by default |

`CustomEvent` is synchronous, zero-dependency, works anywhere in the DOM, and is universally supported. It matches the task requirement of independent placement with no shared ancestor.

---

## REST API

**Endpoint:** `GET /wp-json/nrpb/v1/posts`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `posts_per_page` | int | 6 | Results per page (max 100) |
| `categories` | int[] | [] | Category term IDs (OR logic) |
| `tags` | int[] | [] | Tag term IDs (OR logic) |

**Response:**
```json
{
  "posts": [ { "id": 1, "title": "...", "excerpt": "...", "permalink": "...", "thumbnail_url": "...", "categories": [1, 2], "tags": [3] } ],
  "total": 12,
  "total_pages": 2,
  "page": 1
}
```

---

## Development

```bash
# Watch mode
npm run start

# Production build
npm run build
```

**Build output (`build/`):**

| File | Purpose |
|------|---------|
| `posts-grid.js` | Editor script for Posts Grid block |
| `posts-filter.js` | Editor script for Posts Filter block |
| `pagination.js` | Editor script for Pagination inner block |
| `frontend.js` | Frontend filter/grid controllers |
| `frontend.css` | All frontend styles |

---

## Project Structure

```
nr-posts-blocks/
├── nr-posts-blocks.php          # Plugin header, bootstrap, activation hook
├── includes/
│   ├── class-blocks.php         # Block registration, render callbacks, asset enqueueing
│   ├── class-rest-api.php       # GET /nrpb/v1/posts endpoint
│   └── class-seeder.php         # Demo content creation on activation
├── src/
│   ├── blocks/
│   │   ├── posts-grid/          # block.json, edit.js, save.js, index.js
│   │   ├── posts-filter/        # block.json, edit.js, index.js
│   │   └── pagination/          # block.json, index.js
│   └── frontend/
│       ├── index.js             # Entry point — mounts PostsGrid + PostsFilter
│       ├── posts-grid.js        # Grid controller (fetch, render, pagination)
│       ├── posts-filter.js      # Filter controller (state, CustomEvent dispatch)
│       └── style.scss           # All frontend styles
├── build/                       # Webpack output (gitignored)
├── webpack.config.js
├── package.json
└── .gitignore
```

---

## Architecture Notes

- **Dynamic blocks** — all three blocks use PHP `render_callback`. No post content is re-rendered from saved JS markup. This keeps the output always up to date with the current data.
- **Pagination as inner block** — satisfies the spec requirement while keeping the pagination tightly coupled to the grid in the editor (locked template) and decoupled from the filter at runtime.
- **Namespacing** — all PHP code lives under the `NRPostsBlocks` namespace. All CSS classes use the `nrpb-` prefix. All seeded content uses `nrpb-` slug prefixes.
- **Single activation guard** — the seeder stores a `nrpb_seeded_v1` option after running so it never duplicates content on reactivation.
- **SVG featured images** — generated programmatically on activation so no external HTTP requests or bundled binary assets are needed.
