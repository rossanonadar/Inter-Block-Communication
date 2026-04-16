/**
 * PostsGrid — frontend controller for the .nrpb-posts-grid element.
 */
export class PostsGrid {
	/** @type {HTMLElement} */
	el;

	/** @type {string} */
	blockId;

	/** @type {number} */
	postsPerPage;

	/** @type {number} */
	columns;

	/** @type {number} */
	currentPage = 1;

	/** @type {number} */
	totalPages = 1;

	/** @type {number[]} */
	activeCategories = [];

	/** @type {number[]} */
	activeTags = [];

	/** @type {AbortController|null} */
	abortController = null;

	/** @type {AbortController} — controls event listener lifetime */
	listenerController = new AbortController();

	/** @type {string} */
	apiBase = window.nrpbData?.restUrl ?? '/wp-json/nrpb/v1';

	/** @param {HTMLElement} el */
	constructor( el ) {
		this.el = el;
		this.blockId = el.dataset.blockId ?? '';
		this.postsPerPage = parseInt( el.dataset.postsPerPage ?? '6', 10 );
		this.columns = parseInt( el.dataset.columns ?? '3', 10 );

		this.bindEvents();
		this.fetchPosts();
	}

	bindEvents() {
		document.addEventListener(
			'nrpb:filter-change',
			( e ) => {
				const { blockId, categories, tags } = e.detail;

				// Require an exact blockId match.
				// An empty blockId on either side means the block was not
				// properly initialised — ignore rather than broadcast to all grids.
				if ( ! blockId || ! this.blockId || blockId !== this.blockId ) {
					return;
				}

				this.activeCategories = categories;
				this.activeTags = tags;
				this.currentPage = 1;
				this.fetchPosts();
			},
			{ signal: this.listenerController.signal }
		);
	}

	/**
	 * Removes the document event listener and cancels any in-flight request.
	 * Call this if the grid element is removed from the DOM (e.g. SPA navigation).
	 */
	destroy() {
		this.listenerController.abort();
		if ( this.abortController ) {
			this.abortController.abort();
		}
	}

	async fetchPosts() {
		// Cancel any in-flight request.
		if ( this.abortController ) {
			this.abortController.abort();
		}
		this.abortController = new AbortController();

		this.setLoading( true );

		const params = new URLSearchParams( {
			page: this.currentPage,
			posts_per_page: this.postsPerPage,
		} );

		if ( this.activeCategories.length ) {
			params.set( 'categories', this.activeCategories.join( ',' ) );
		}
		if ( this.activeTags.length ) {
			params.set( 'tags', this.activeTags.join( ',' ) );
		}

		try {
			const response = await fetch(
				`${ this.apiBase }/posts?${ params.toString() }`,
				{
					signal: this.abortController.signal,
					headers: {
						'X-WP-Nonce': window.nrpbData?.nonce ?? '',
					},
				}
			);

			if ( ! response.ok ) {
				throw new Error( `HTTP ${ response.status }` );
			}

			const data = await response.json();
			this.totalPages = data.total_pages ?? 1;
			this.renderPosts( data.posts ?? [] );
			this.renderPagination();
		} catch ( err ) {
			if ( err.name !== 'AbortError' ) {
				this.renderError();
			}
		} finally {
			this.setLoading( false );
		}
	}

	/** @param {object[]} posts */
	renderPosts( posts ) {
		const inner = this.el.querySelector( '.nrpb-posts-grid__inner' );
		if ( ! inner ) return;

		if ( posts.length === 0 ) {
			inner.innerHTML = `<p class="nrpb-posts-grid__no-results">${ window.nrpbData?.i18n?.noResults ?? 'No posts found.' }</p>`;
			return;
		}

		inner.innerHTML = posts.map( this.postCardHTML ).join( '' );
	}

	/** @param {object} post */
	postCardHTML( post ) {
		const imageHtml = post.thumbnail_url
			? `<div class="nrpb-post-card__image">
					<a href="${ post.permalink }" tabindex="-1" aria-hidden="true">
						<img src="${ post.thumbnail_url }" alt="${ escapeHtml( post.thumbnail_alt ) }">
					</a>
			   </div>`
			: '';

		return `
			<article class="nrpb-post-card" data-post-id="${ post.id }">
				${ imageHtml }
				<div class="nrpb-post-card__body">
					<h3 class="nrpb-post-card__title">
						<a href="${ post.permalink }">${ escapeHtml( post.title ) }</a>
					</h3>
					<div class="nrpb-post-card__excerpt">
						<p>${ escapeHtml( post.excerpt ) }</p>
					</div>
					<a class="nrpb-post-card__read-more" href="${ post.permalink }">
						Read more
					</a>
				</div>
			</article>
		`;
	}

	renderPagination() {
		const paginationEl = this.el.querySelector( '.nrpb-pagination' );
		if ( ! paginationEl ) return;

		if ( this.totalPages <= 1 ) {
			paginationEl.innerHTML = '';
			return;
		}

		const buttons = [];

		// Previous button.
		buttons.push( `
			<button
				class="nrpb-pagination__btn nrpb-pagination__btn--prev"
				data-page="${ this.currentPage - 1 }"
				${ this.currentPage <= 1 ? 'disabled aria-disabled="true"' : '' }
				aria-label="Previous page"
			>&#8592; Prev</button>
		` );

		// Page number buttons.
		for ( let i = 1; i <= this.totalPages; i++ ) {
			buttons.push( `
				<button
					class="nrpb-pagination__btn nrpb-pagination__btn--page ${ i === this.currentPage ? 'is-active' : '' }"
					data-page="${ i }"
					aria-label="Page ${ i }"
					aria-current="${ i === this.currentPage ? 'page' : 'false' }"
				>${ i }</button>
			` );
		}

		// Next button.
		buttons.push( `
			<button
				class="nrpb-pagination__btn nrpb-pagination__btn--next"
				data-page="${ this.currentPage + 1 }"
				${ this.currentPage >= this.totalPages ? 'disabled aria-disabled="true"' : '' }
				aria-label="Next page"
			>Next &#8594;</button>
		` );

		paginationEl.innerHTML = buttons.join( '' );

		paginationEl.querySelectorAll( '[data-page]' ).forEach( ( btn ) => {
			btn.addEventListener( 'click', ( e ) => {
				const page = parseInt( e.currentTarget.dataset.page, 10 );
				if ( ! isNaN( page ) && page !== this.currentPage ) {
					this.currentPage = page;
					this.fetchPosts();
					this.el.scrollIntoView( { behavior: 'smooth', block: 'start' } );
				}
			} );
		} );
	}

	renderError() {
		const inner = this.el.querySelector( '.nrpb-posts-grid__inner' );
		if ( inner ) {
			inner.innerHTML = '<p class="nrpb-posts-grid__error">Failed to load posts. Please try again.</p>';
		}
	}

	/** @param {boolean} isLoading */
	setLoading( isLoading ) {
		this.el.classList.toggle( 'is-loading', isLoading );
		this.el.setAttribute( 'aria-busy', isLoading ? 'true' : 'false' );
	}
}

/** @param {string} str */
function escapeHtml( str ) {
	const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
	return String( str ).replace( /[&<>"']/g, ( m ) => map[ m ] );
}
