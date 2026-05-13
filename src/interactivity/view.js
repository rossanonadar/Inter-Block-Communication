/**
 * Interactivity API store for nrpb/posts-filter and nrpb/posts-grid.
 *
 * Replaces the CustomEvent bus (nrpb:filter-change).
 * State is keyed by blockId so multiple Filter+Grid pairs on the same
 * page remain fully isolated — same guarantee as before.
 *
 * state.filters[blockId]  — selected categories, tags, current page
 * state.grids[blockId]    — postsPerPage, totalPages (set from PHP via wp_interactivity_state)
 * state.loadingBlocks     — array of blockIds currently fetching
 *
 * Directives on static HTML (filter buttons, clear button, grid wrapper)
 * are declared in the PHP render callbacks via data-wp-* attributes.
 * Pagination is still rendered imperatively (dynamic HTML after fetch)
 * and handled via delegated click listener set up in callbacks.initGrid.
 */

import { store, getContext } from '@wordpress/interactivity';

// ---------------------------------------------------------------------------
// DOM helpers — kept from the old PostsGrid class, now standalone functions.
// ---------------------------------------------------------------------------

/** @param {string} str */
function escapeHtml( str ) {
	const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
	return String( str ).replace( /[&<>"']/g, ( m ) => map[ m ] );
}

/** @param {object} post */
function postCardHTML( post ) {
	const imageHtml = post.thumbnail_url
		? `<div class="nrpb-post-card__image">
				<a href="${ escapeHtml( post.permalink ) }" tabindex="-1" aria-hidden="true">
					<img src="${ escapeHtml( post.thumbnail_url ) }" alt="${ escapeHtml( post.thumbnail_alt ) }">
				</a>
		   </div>`
		: '';

	const primaryCategory =
		Array.isArray( post.categories ) && post.categories.length ? post.categories[ 0 ] : null;

	const categoryHtml = primaryCategory
		? `<span class="nrpb-post-card__category" data-slug="${ escapeHtml( primaryCategory.slug ) }">
				${ escapeHtml( primaryCategory.name ) }
		   </span>`
		: '';

	const tagsHtml =
		Array.isArray( post.tags ) && post.tags.length
			? `<div class="nrpb-post-card__tags" aria-label="Tags">
					${ post.tags
						.map( ( tag ) => `<span class="nrpb-post-card__tag">#${ escapeHtml( tag.name ) }</span>` )
						.join( '' ) }
			   </div>`
			: '';

	return `
		<article class="nrpb-post-card" data-post-id="${ post.id }">
			${ imageHtml }
			<div class="nrpb-post-card__body">
				${ categoryHtml }
				<h3 class="nrpb-post-card__title">
					<a href="${ escapeHtml( post.permalink ) }">${ escapeHtml( post.title ) }</a>
				</h3>
				<div class="nrpb-post-card__excerpt">
					<p>${ escapeHtml( post.excerpt ) }</p>
				</div>
				${ tagsHtml }
				<a class="nrpb-post-card__read-more" href="${ escapeHtml( post.permalink ) }">Read more</a>
			</div>
		</article>
	`;
}

/** @param {string} blockId  @param {object[]} posts */
function renderPosts( blockId, posts ) {
	const inner = document
		.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
		?.querySelector( '.nrpb-posts-grid__inner' );
	if ( ! inner ) return;

	inner.innerHTML =
		posts.length === 0
			? `<p class="nrpb-posts-grid__no-results">${ window.nrpbData?.i18n?.noResults ?? 'No posts found.' }</p>`
			: posts.map( postCardHTML ).join( '' );
}

/** @param {string} blockId  @param {number} currentPage  @param {number} totalPages */
function renderPagination( blockId, currentPage, totalPages ) {
	const paginationEl = document
		.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
		?.querySelector( '.nrpb-pagination' );
	if ( ! paginationEl ) return;

	if ( totalPages <= 1 ) {
		paginationEl.innerHTML = '';
		return;
	}

	const buttons = [];
	buttons.push(
		`<button class="nrpb-pagination__btn nrpb-pagination__btn--prev" data-page="${ currentPage - 1 }" ${ currentPage <= 1 ? 'disabled aria-disabled="true"' : '' } aria-label="Previous page">&#8592; Prev</button>`
	);
	for ( let i = 1; i <= totalPages; i++ ) {
		buttons.push(
			`<button class="nrpb-pagination__btn nrpb-pagination__btn--page${ i === currentPage ? ' is-active' : '' }" data-page="${ i }" aria-label="Page ${ i }"${ i === currentPage ? ' aria-current="page"' : '' }>${ i }</button>`
		);
	}
	buttons.push(
		`<button class="nrpb-pagination__btn nrpb-pagination__btn--next" data-page="${ currentPage + 1 }" ${ currentPage >= totalPages ? 'disabled aria-disabled="true"' : '' } aria-label="Next page">Next &#8594;</button>`
	);

	paginationEl.innerHTML = buttons.join( '' );
}

/**
 * Adds/removes the `is-active` class and updates `aria-pressed` on every
 * filter button for the given block, driven directly from state.
 *
 * Called imperatively instead of relying on data-wp-class:is-active because
 * Preact signal subscriptions track the deepest proxy accessed; replacing the
 * top-level state.filters object orphans nested array subscriptions, so the
 * reactive directive never re-fires. Imperative DOM updates are guaranteed.
 *
 * @param {string} blockId
 */
function updateFilterButtons( blockId ) {
	const filter = state.filters[ blockId ];
	const filterEl = document.querySelector( `.nrpb-posts-filter[data-block-id="${ blockId }"]` );
	if ( ! filterEl || ! filter ) return;

	filterEl.querySelectorAll( '.nrpb-posts-filter__btn[data-filter-type]' ).forEach( ( btn ) => {
		const type   = btn.dataset.filterType;
		const id     = parseInt( btn.dataset.filterValue, 10 );
		const active = type === 'category'
			? filter.categories.includes( id )
			: filter.tags.includes( id );
		btn.classList.toggle( 'is-active', active );
		btn.setAttribute( 'aria-pressed', String( active ) );
	} );
}

/**
 * Shows or hides the clear-button for a given block imperatively.
 * Called from every action that changes filter state so the button is
 * always in sync regardless of reactive-system tracking depth.
 *
 * @param {string} blockId
 */
function updateClearButton( blockId ) {
	const filterEl = document.querySelector( `.nrpb-posts-filter[data-block-id="${ blockId }"]` );
	const btn = filterEl?.querySelector( '.nrpb-posts-filter__clear' );
	if ( ! btn ) return;
	const filter = state.filters[ blockId ];
	btn.hidden = ! ( filter?.categories.length || filter?.tags.length );
}

/** @param {string} blockId */
function renderError( blockId ) {
	const inner = document
		.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
		?.querySelector( '.nrpb-posts-grid__inner' );
	if ( inner ) {
		inner.innerHTML = '<p class="nrpb-posts-grid__error">Failed to load posts. Please try again.</p>';
	}
}

// One AbortController per blockId — cancelled before each new fetch for that block.
const abortControllers = {};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const { state, actions } = store( 'nrpb', {
	/**
	 * state.filters and state.grids are seeded from PHP via wp_interactivity_state()
	 * in each block's render callback — one entry per blockId.
	 * state.loadingBlocks is a shared array; membership indicates an in-flight request.
	 */
	state: {
		filters: {},
		grids: {},
		loadingBlocks: [],

		/** True when this button's filter ID is in the active set. */
		get isFilterActive() {
			const { blockId, filterId, filterType } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return false;
			return filterType === 'category'
				? filter.categories.includes( filterId )
				: filter.tags.includes( filterId );
		},

		/** True when any filter is selected (drives clear-button visibility). */
		get hasActiveFilters() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			return Boolean( filter?.categories.length || filter?.tags.length );
		},

		/** Inverse — used for aria-hidden on the clear button. */
		get isFilterEmpty() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			return ! ( filter?.categories.length || filter?.tags.length );
		},

		/** True while this grid's blockId is in loadingBlocks. */
		get isLoading() {
			const { blockId } = getContext();
			return state.loadingBlocks.includes( blockId );
		},
	},

	actions: {
		/** Toggles a category or tag filter — driven by data-wp-on--click on filter buttons. */
		toggleFilter() {
			const { blockId, filterId, filterType } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const key = filterType === 'category' ? 'categories' : 'tags';
			const current = filter[ key ];
			const updated = current.includes( filterId )
				? current.filter( ( id ) => id !== filterId )
				: [ ...current, filterId ];

			// Replace the top-level filters entry so Preact signals fire reliably.
			state.filters = {
				...state.filters,
				[ blockId ]: { ...filter, [ key ]: updated, page: 1 },
			};

			updateClearButton( blockId );
			updateFilterButtons( blockId );
			actions._syncFilterURL( blockId );
			actions._fetchPosts( blockId );
		},

		/** Clears all filters — driven by data-wp-on--click on the clear button. */
		clearFilters() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			state.filters = {
				...state.filters,
				[ blockId ]: { ...filter, categories: [], tags: [], page: 1 },
			};

			updateClearButton( blockId );
			updateFilterButtons( blockId );
			actions._syncFilterURL( blockId );
			actions._fetchPosts( blockId );
		},

		/** Writes filter state to URL via replaceState. Removes nrpb_page (page resets). */
		_syncFilterURL( blockId ) {
			const filter = state.filters[ blockId ];
			const params = new URLSearchParams( window.location.search );

			filter.categories.length
				? params.set( 'nrpb_categories', filter.categories.join( ',' ) )
				: params.delete( 'nrpb_categories' );
			filter.tags.length
				? params.set( 'nrpb_tags', filter.tags.join( ',' ) )
				: params.delete( 'nrpb_tags' );
			params.delete( 'nrpb_page' );

			const qs = params.toString();
			history.replaceState(
				null,
				'',
				( qs ? `${ location.pathname }?${ qs }` : location.pathname ) + location.hash
			);
		},

		/** Writes current page to URL via pushState (creates back/forward history entry). */
		_syncPageURL( blockId ) {
			const filter = state.filters[ blockId ];
			const params = new URLSearchParams( window.location.search );

			filter.page > 1
				? params.set( 'nrpb_page', String( filter.page ) )
				: params.delete( 'nrpb_page' );

			const qs = params.toString();
			history.pushState(
				null,
				'',
				( qs ? `${ location.pathname }?${ qs }` : location.pathname ) + location.hash
			);
		},

		/** Fetches filtered posts from the REST endpoint and re-renders posts + pagination. */
		async _fetchPosts( blockId ) {
			const filter = state.filters[ blockId ];
			const grid = state.grids[ blockId ];
			if ( ! filter || ! grid ) return;

			// Abort any in-flight request for this block before starting a new one.
			abortControllers[ blockId ]?.abort();
			const controller = new AbortController();
			abortControllers[ blockId ] = controller;

			// Defensive guard: only one fetch runs per blockId at a time (the abort
			// above guarantees it), but avoid duplicate entries in case of edge cases.
			if ( ! state.loadingBlocks.includes( blockId ) ) {
				state.loadingBlocks = [ ...state.loadingBlocks, blockId ];
			}

			const params = new URLSearchParams( {
				page: filter.page,
				posts_per_page: grid.postsPerPage,
			} );
			if ( filter.categories.length ) params.set( 'categories', filter.categories.join( ',' ) );
			if ( filter.tags.length ) params.set( 'tags', filter.tags.join( ',' ) );

			try {
				const res = await fetch(
					`${ window.nrpbData?.restUrl ?? '/wp-json/nrpb/v1' }/posts?${ params }`,
					{
						headers: { 'X-WP-Nonce': window.nrpbData?.nonce ?? '' },
						signal: controller.signal,
					}
				);
				if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
				const data = await res.json();
				grid.totalPages = data.total_pages ?? 1;
				renderPosts( blockId, data.posts ?? [] );
				renderPagination( blockId, filter.page, grid.totalPages );
			} catch ( err ) {
				if ( err.name !== 'AbortError' ) {
					renderError( blockId );
				}
			} finally {
				state.loadingBlocks = state.loadingBlocks.filter( ( id ) => id !== blockId );
			}
		},
	},

	callbacks: {
		/**
		 * Runs once when the filter wrapper mounts (data-wp-init on the filter element).
		 * Reads URL params and sets filter state; adds popstate listener for back/forward.
		 */
		initFilter() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const params = new URLSearchParams( window.location.search );
			const cats = params.get( 'nrpb_categories' );
			const tags = params.get( 'nrpb_tags' );

			if ( cats || tags ) {
				state.filters = {
					...state.filters,
					[ blockId ]: {
						...filter,
						categories: cats ? cats.split( ',' ).map( Number ).filter( Boolean ) : filter.categories,
						tags:       tags ? tags.split( ',' ).map( Number ).filter( Boolean ) : filter.tags,
					},
				};
				updateClearButton( blockId );
				updateFilterButtons( blockId );
			}

			window.addEventListener( 'popstate', () => {
				const p = new URLSearchParams( window.location.search );
				const c = p.get( 'nrpb_categories' );
				const t = p.get( 'nrpb_tags' );
				const pg = parseInt( p.get( 'nrpb_page' ) || '1', 10 );
				if ( ! state.filters[ blockId ] ) return;
				state.filters = {
					...state.filters,
					[ blockId ]: {
						...state.filters[ blockId ],
						categories: c ? c.split( ',' ).map( Number ).filter( Boolean ) : [],
						tags:       t ? t.split( ',' ).map( Number ).filter( Boolean ) : [],
						page:       isNaN( pg ) || pg < 1 ? 1 : pg,
					},
				};
				updateClearButton( blockId );
				updateFilterButtons( blockId );
				actions._fetchPosts( blockId );
			} );
		},

		/**
		 * Runs once when the grid wrapper mounts (data-wp-init on the grid element).
		 * Reads URL params, sets up delegated pagination handler, fetches if URL has state.
		 */
		initGrid() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const params = new URLSearchParams( window.location.search );
			const page = parseInt( params.get( 'nrpb_page' ) || '1', 10 );
			const cats = params.get( 'nrpb_categories' );
			const tags = params.get( 'nrpb_tags' );

			const urlCats = cats && ! filter.categories.length
				? cats.split( ',' ).map( Number ).filter( Boolean )
				: filter.categories;
			const urlTags = tags && ! filter.tags.length
				? tags.split( ',' ).map( Number ).filter( Boolean )
				: filter.tags;
			const urlPage = page > 1 ? page : filter.page;

			if ( urlCats !== filter.categories || urlTags !== filter.tags || urlPage !== filter.page ) {
				state.filters = {
					...state.filters,
					[ blockId ]: { ...filter, categories: urlCats, tags: urlTags, page: urlPage },
				};
			}

			// Pagination is rendered imperatively after each fetch, so directives
			// can't be used. Delegate from the stable wrapper instead.
			const gridEl = document.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` );
			const paginationEl = gridEl?.querySelector( '.nrpb-pagination' );
			if ( paginationEl ) {
				paginationEl.addEventListener( 'click', ( e ) => {
					const btn = e.target.closest( '[data-page]' );
					if ( ! btn || btn.disabled || btn.getAttribute( 'aria-disabled' ) === 'true' ) return;
					const p = parseInt( btn.dataset.page, 10 );
					// Always read a fresh reference — state.filters[blockId] may have been
					// replaced by toggleFilter since this handler was registered.
					const currentFilter = state.filters[ blockId ];
					if ( isNaN( p ) || p === currentFilter.page ) return;
					state.filters = {
						...state.filters,
						[ blockId ]: { ...currentFilter, page: p },
					};
					actions._syncPageURL( blockId );
					actions._fetchPosts( blockId );
					gridEl.scrollIntoView( { behavior: 'smooth', block: 'start' } );
				} );
			}

			if ( page > 1 || cats || tags ) {
				actions._fetchPosts( blockId );
			}
		},
	},
} );
