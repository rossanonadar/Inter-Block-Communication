# CLAUDE.md — NR Posts Blocks

## Commands

```bash
npm run build   # production build (outputs to build/)
npm run start   # watch mode
```

## Architecture

Two Gutenberg blocks (`nrpb/posts-grid`, `nrpb/posts-filter`) share a single Interactivity API store (`nrpb`). A third inner block (`nrpb/pagination`) lives inside the grid. All frontend logic lives in `src/interactivity/view.js`.

**Progressive enhancement:** PHP renders SSR post cards for no-JS users and SEO. On the first filter action or URL-param restore, `_fetchPosts` sets `state.hasFetched[blockId] = true`. The SSR cards then hide themselves via `data-wp-class--is-hidden="state.ssrIsHidden"` and the `<template data-wp-each--post>` takes over declaratively.

## Interactivity API patterns

- Store namespace: `nrpb`
- State is keyed by `blockId` everywhere — multiple block pairs on the same page are fully isolated
- **In-place mutations only** (`state.filters[blockId].categories = updated`) — spread replacement orphans Preact subscriptions and breaks reactive directives
- `getContext()` is called inside getters, not outside — getters are lazy, context is only valid during directive evaluation
- Directive values support negation: `data-wp-class--is-hidden="!state.showNoResults"`

## State shape

```
state.filters[blockId]    — { categories[], tags[], page }
state.grids[blockId]      — { postsPerPage, totalPages }
state.posts[blockId]      — PostObject[] (empty until first fetch)
state.pagination[blockId] — { currentPage, totalPages, prevDisabled, nextDisabled, pages[] }
state.hasFetched[blockId] — SSR → template handoff gate
state.hasResults[blockId] — false when fetch returns 0 posts
state.hasError[blockId]   — true when fetch fails
state.loadingBlocks       — blockIds with in-flight requests
```

## Key getters

| Getter | Purpose |
|--------|---------|
| `ssrIsHidden` | True after first fetch — SSR articles add `is-hidden` |
| `currentPosts` | `state.posts[blockId] ?? []` — drives `data-wp-each--post` |
| `postTags` | `context.post.tags` — drives nested `data-wp-each--tag` |
| `currentPaginationPages` | pages array — drives `data-wp-each--btn` |
| `prevBtnIsDisabled` / `nextBtnIsDisabled` | Pagination prev/next state |
| `isFilterActive` | Whether the current filter button is selected |
| `hasActiveFilters` | Whether any filter is active (shows clear button) |
| `showNoResults` / `showError` | Post-fetch visibility states |

## Markup drift prevention

SSR cards and the JS template always render the same element structure. Optional elements (image, category, tags) use `.is-hidden` class rather than being conditionally omitted:
- SSR: PHP adds `is-hidden` via string concatenation when element has no content
- Template: `data-wp-class--is-hidden="!state.postHasImage"` etc. controls it reactively
- Tag `#` prefix: **never** added in PHP or JS — CSS adds it via `&__tag::before { content: '#'; }`

## CSS utility

`.is-hidden { display: none !important; }` is defined in `_layout.scss`. Use this class for initial hidden state of dynamic elements.

## REST API

`GET /wp-json/nrpb/v1/posts` — custom endpoint in `includes/class-rest-api.php`.  
Response shape: `{ posts[], total, total_pages, page }`.  
Posts include `id, title, excerpt, permalink, thumbnail_url, thumbnail_alt, categories[], tags[]`.  
Caching via transients (10 min), invalidated on post save/delete/term change.

## URL persistence

| Param | Controls |
|-------|---------|
| `nrpb_categories` | Selected category IDs (comma-separated) |
| `nrpb_tags` | Selected tag IDs |
| `nrpb_page` | Current page number |

`initFilter` / `initGrid` callbacks restore these on mount. `popstate` listener handles back/forward.

## Build system

Two Webpack configs (`webpack.config.js`):
- `main`: IIFE output for editor scripts + CSS
- `interactivity`: ES module output for `src/interactivity/view.js` → registered via `viewScriptModule`

`@wordpress/interactivity` is externalised — WordPress provides it via import map at runtime.

## File map

```
includes/class-blocks.php    — block registration, PHP render callbacks, asset enqueueing
includes/class-rest-api.php  — REST endpoint, caching, tax_query logic
includes/class-seeder.php    — demo data seeder (runs once on activation)
src/interactivity/view.js    — Interactivity API store
src/styles/                  — SCSS partials (_layout, _filter, _card, _pagination, _variables, _mixins)
src/blocks/*/block.json      — block metadata (source; copied to build/ by webpack)
build/                       — webpack output (gitignored)
```
