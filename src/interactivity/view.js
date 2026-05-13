/**
 * Interactivity API store for nrpb/posts-filter and nrpb/posts-grid.
 *
 * Architecture: PHP renders SSR post cards for progressive enhancement.
 * On first user interaction (or URL-param restore), _fetchPosts sets
 * state.hasFetched[blockId] = true, which hides the SSR cards and lets
 * the data-wp-each--post template take over. All DOM updates after that
 * point are declarative — no innerHTML, no manual class toggling.
 *
 * state.filters[blockId]    — selected categories, tags, current page
 * state.grids[blockId]      — postsPerPage, totalPages
 * state.posts[blockId]      — PostObject[] after first fetch (empty until then)
 * state.pagination[blockId] — PaginationState after first fetch
 * state.hasFetched[blockId] — gates SSR → template handoff
 * state.hasResults[blockId] — false when fetch returns 0 posts
 * state.hasError[blockId]   — true when fetch fails
 * state.loadingBlocks       — blockIds with in-flight requests
 */

import { store, getContext, getConfig } from '@wordpress/interactivity';

// Config seeded by wp_interactivity_config() in the PHP render callback.
// Provides REST URL, nonce, and default category ID without a global window object.
const { restUrl = '/wp-json/nrpb/v1', nonce = '', defaultCategoryId = 0 } =
	getConfig( 'nrpb' ) ?? {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the pagination state object consumed by the data-wp-each--btn template.
 *
 * @param {number} currentPage
 * @param {number} totalPages
 */
function buildPagination( currentPage, totalPages ) {
	if ( totalPages <= 1 ) {
		return { currentPage, totalPages, prevDisabled: true, nextDisabled: true, pages: [] };
	}
	return {
		currentPage,
		totalPages,
		prevDisabled: currentPage <= 1,
		nextDisabled: currentPage >= totalPages,
		pages: Array.from( { length: totalPages }, ( _, i ) => ( {
			page:      i + 1,
			isCurrent: i + 1 === currentPage,
		} ) ),
	};
}

// One AbortController per blockId — cancelled before each new fetch.
const abortControllers = {};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const { state, actions } = store( 'nrpb', {
	state: {
		// Seeded from PHP via wp_interactivity_state() in each block's render callback.
		filters:       {},
		grids:         {},
		loadingBlocks: [],

		// Populated by _fetchPosts after the first user interaction or URL restore.
		posts:      {},
		pagination: {},
		hasFetched: {},
		hasResults: {},
		hasError:   {},

		// ---- Grid state ----------------------------------------------------------

		get isLoading() {
			const { blockId } = getContext();
			return state.loadingBlocks.includes( blockId );
		},

		// ---- Filter button state -------------------------------------------------

		get isFilterActive() {
			const { blockId, filterId, filterType } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return false;
			return filterType === 'category'
				? filter.categories.includes( filterId )
				: filter.tags.includes( filterId );
		},

		get hasActiveFilters() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			return Boolean( filter?.categories.length || filter?.tags.length );
		},

		get clearBtnTabIndex() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			return Boolean( filter?.categories.length || filter?.tags.length ) ? 0 : -1;
		},

		// ---- Post card getters (used inside data-wp-each--post template) ---------

		get postHasImage() {
			const { post } = getContext();
			return Boolean( post?.thumbnail_url );
		},

		get postPrimaryCategory() {
			const { post } = getContext();
			if ( ! Array.isArray( post?.categories ) ) return { name: '', slug: '' };
			return post.categories.find( ( c ) => c.id !== defaultCategoryId ) ?? { name: '', slug: '' };
		},

		get postHasPrimaryCategory() {
			const { post } = getContext();
			if ( ! Array.isArray( post?.categories ) ) return false;
			return post.categories.some( ( c ) => c.id !== defaultCategoryId );
		},

		get postHasTags() {
			const { post } = getContext();
			return Array.isArray( post?.tags ) && post.tags.length > 0;
		},

		// ---- Pagination getters (used inside data-wp-each--btn template) ---------

		get paginationBtnAriaCurrent() {
			const { btn } = getContext();
			// Returning false removes the attribute; 'page' sets it.
			return btn?.isCurrent ? 'page' : false;
		},

		// ---- Dynamic container visibility ---------------------------------------

		get showNoResults() {
			const { blockId } = getContext();
			return state.hasFetched[ blockId ] && ! state.hasResults[ blockId ];
		},

		get showError() {
			const { blockId } = getContext();
			return state.hasFetched[ blockId ] && Boolean( state.hasError[ blockId ] );
		},

		// ---- SSR / dynamic handoff getters -------------------------------------

		// True after the first fetch; SSR elements use this to hide themselves.
		get ssrIsHidden() {
			const { blockId } = getContext();
			return Boolean( state.hasFetched[ blockId ] );
		},

		// Posts array for the current block — drives data-wp-each--post.
		get currentPosts() {
			const { blockId } = getContext();
			return state.posts[ blockId ] ?? [];
		},

		// Tags for the current post in context — drives nested data-wp-each--tag.
		get postTags() {
			const { post } = getContext();
			return Array.isArray( post?.tags ) ? post.tags : [];
		},

		// Pagination page buttons for the current block — drives data-wp-each--btn.
		get currentPaginationPages() {
			const { blockId } = getContext();
			return state.pagination[ blockId ]?.pages ?? [];
		},

		get prevBtnIsDisabled() {
			const { blockId } = getContext();
			return state.pagination[ blockId ]?.prevDisabled ?? true;
		},

		get nextBtnIsDisabled() {
			const { blockId } = getContext();
			return state.pagination[ blockId ]?.nextDisabled ?? true;
		},

		// ---- Accessibility status announcement ----------------------------------
		// Empty while loading (polite aria-live won't announce empty text).
		// Announced once after each completed fetch.

		get statusMessage() {
			const { blockId } = getContext();
			if ( state.loadingBlocks.includes( blockId ) ) return '';
			if ( ! state.hasFetched[ blockId ] ) return '';
			if ( state.hasError[ blockId ] ) return 'Something went wrong. Please try again.';
			if ( ! state.hasResults[ blockId ] ) return 'No posts found.';
			const count = ( state.posts[ blockId ] ?? [] ).length;
			return count === 1 ? 'Showing 1 post.' : `Showing ${ count } posts.`;
		},
	},

	actions: {
		toggleFilter() {
			const { blockId, filterId, filterType } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const key     = filterType === 'category' ? 'categories' : 'tags';
			const current = filter[ key ];
			const updated = current.includes( filterId )
				? current.filter( ( id ) => id !== filterId )
				: [ ...current, filterId ];

			// In-place mutation keeps the reactive Preact proxy intact so
			// data-wp-class--is-active and data-wp-class--is-visible re-fire.
			state.filters[ blockId ][ key ] = updated;
			state.filters[ blockId ].page   = 1;

			actions._syncFilterURL( blockId );
			actions._fetchPosts( blockId );
		},

		clearFilters() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			state.filters[ blockId ].categories = [];
			state.filters[ blockId ].tags       = [];
			state.filters[ blockId ].page       = 1;

			actions._syncFilterURL( blockId );
			actions._fetchPosts( blockId );
		},

		goToPage() {
			const { blockId, btn } = getContext();
			if ( ! btn?.page ) return;
			const filter = state.filters[ blockId ];
			if ( ! filter || btn.page === filter.page ) return;

			state.filters[ blockId ].page = btn.page;
			actions._syncPageURL( blockId );
			actions._fetchPosts( blockId );
			document
				.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
				?.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		},

		prevPage() {
			const { blockId } = getContext();
			const currentPage = state.filters[ blockId ]?.page ?? 1;
			if ( currentPage <= 1 ) return;

			state.filters[ blockId ].page = currentPage - 1;
			actions._syncPageURL( blockId );
			actions._fetchPosts( blockId );
			document
				.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
				?.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		},

		nextPage() {
			const { blockId } = getContext();
			const pagination  = state.pagination[ blockId ];
			const currentPage = state.filters[ blockId ]?.page ?? 1;
			if ( ! pagination || currentPage >= pagination.totalPages ) return;

			state.filters[ blockId ].page = currentPage + 1;
			actions._syncPageURL( blockId );
			actions._fetchPosts( blockId );
			document
				.querySelector( `.nrpb-posts-grid[data-block-id="${ blockId }"]` )
				?.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		},

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

		async _fetchPosts( blockId ) {
			const filter = state.filters[ blockId ];
			const grid   = state.grids[ blockId ];
			if ( ! filter || ! grid ) return;

			abortControllers[ blockId ]?.abort();
			const controller = new AbortController();
			abortControllers[ blockId ] = controller;

			if ( ! state.loadingBlocks.includes( blockId ) ) {
				state.loadingBlocks = [ ...state.loadingBlocks, blockId ];
			}

			const params = new URLSearchParams( {
				page:           filter.page,
				posts_per_page: grid.postsPerPage,
			} );
			if ( filter.categories.length ) params.set( 'categories', filter.categories.join( ',' ) );
			if ( filter.tags.length ) params.set( 'tags', filter.tags.join( ',' ) );

			try {
				const res = await fetch(
					`${ restUrl }/posts?${ params }`,
					{
						headers: { 'X-WP-Nonce': nonce },
						signal:  controller.signal,
					}
				);
				if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
				const data = await res.json();

				const posts      = data.posts ?? [];
				const totalPages = data.total_pages ?? 1;

				state.grids[ blockId ].totalPages = totalPages;

				// All DOM updates are now handled declaratively by directives.
				state.posts[ blockId ]      = posts;
				state.pagination[ blockId ] = buildPagination( filter.page, totalPages );
				state.hasResults[ blockId ] = posts.length > 0;
				state.hasError[ blockId ]   = false;
				// Setting hasFetched last triggers the SSR → template handoff.
				state.hasFetched[ blockId ] = true;
			} catch ( err ) {
				if ( err.name !== 'AbortError' ) {
					state.hasError[ blockId ]   = true;
					state.hasFetched[ blockId ] = true;
				}
			} finally {
				if ( abortControllers[ blockId ] === controller ) {
					delete abortControllers[ blockId ];
					state.loadingBlocks = state.loadingBlocks.filter( ( id ) => id !== blockId );
				}
			}
		},
	},

	callbacks: {
		initFilter() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const params = new URLSearchParams( window.location.search );
			const cats   = params.get( 'nrpb_categories' );
			const tags   = params.get( 'nrpb_tags' );

			if ( cats || tags ) {
				state.filters[ blockId ].categories = cats
					? cats.split( ',' ).map( Number ).filter( Boolean )
					: filter.categories;
				state.filters[ blockId ].tags = tags
					? tags.split( ',' ).map( Number ).filter( Boolean )
					: filter.tags;
			}

			window.addEventListener( 'popstate', () => {
				const p  = new URLSearchParams( window.location.search );
				const c  = p.get( 'nrpb_categories' );
				const t  = p.get( 'nrpb_tags' );
				const pg = parseInt( p.get( 'nrpb_page' ) || '1', 10 );
				if ( ! state.filters[ blockId ] ) return;

				state.filters[ blockId ].categories = c
					? c.split( ',' ).map( Number ).filter( Boolean )
					: [];
				state.filters[ blockId ].tags = t
					? t.split( ',' ).map( Number ).filter( Boolean )
					: [];
				state.filters[ blockId ].page = isNaN( pg ) || pg < 1 ? 1 : pg;

				actions._fetchPosts( blockId );
			} );
		},

		initGrid() {
			const { blockId } = getContext();
			const filter = state.filters[ blockId ];
			if ( ! filter ) return;

			const params = new URLSearchParams( window.location.search );
			const page   = parseInt( params.get( 'nrpb_page' ) || '1', 10 );
			const cats   = params.get( 'nrpb_categories' );
			const tags   = params.get( 'nrpb_tags' );

			const urlCats = cats && ! filter.categories.length
				? cats.split( ',' ).map( Number ).filter( Boolean )
				: filter.categories;
			const urlTags = tags && ! filter.tags.length
				? tags.split( ',' ).map( Number ).filter( Boolean )
				: filter.tags;
			const urlPage = page > 1 ? page : filter.page;

			if ( urlCats !== filter.categories ) state.filters[ blockId ].categories = urlCats;
			if ( urlTags !== filter.tags ) state.filters[ blockId ].tags = urlTags;
			if ( urlPage !== filter.page ) state.filters[ blockId ].page = urlPage;

			// Fetch only when URL carries non-default state — otherwise SSR content stands.
			if ( page > 1 || cats || tags ) {
				actions._fetchPosts( blockId );
			}
		},
	},
} );
