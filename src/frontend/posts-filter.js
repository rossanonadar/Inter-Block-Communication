/**
 * PostsFilter — frontend controller for the .nrpb-posts-filter element.
 *
 * Dispatches `nrpb:filter-change` CustomEvents on document whenever
 * the user toggles a filter button. The PostsGrid listens for these.
 */
export class PostsFilter {
	/** @type {HTMLElement} */
	el;

	/** @type {string} */
	blockId;

	/** @type {Set<number>} */
	selectedCategories = new Set();

	/** @type {Set<number>} */
	selectedTags = new Set();

	/** @param {HTMLElement} el */
	constructor( el ) {
		this.el = el;
		this.blockId = el.dataset.blockId ?? '';
		this.bindEvents();
	}

	bindEvents() {
		this.el.querySelectorAll( '.nrpb-posts-filter__btn' ).forEach( ( btn ) => {
			btn.addEventListener( 'click', () => this.handleFilterClick( btn ) );
		} );

		const clearBtn = this.el.querySelector( '.nrpb-posts-filter__clear' );
		if ( clearBtn ) {
			clearBtn.addEventListener( 'click', () => this.clearFilters() );
		}
	}

	/** @param {HTMLElement} btn */
	handleFilterClick( btn ) {
		const type = btn.dataset.filterType;
		const value = parseInt( btn.dataset.filterValue, 10 );

		if ( type === 'category' ) {
			this.toggleFilter( this.selectedCategories, value );
		} else if ( type === 'tag' ) {
			this.toggleFilter( this.selectedTags, value );
		}

		this.updateButtonState( btn );
		this.updateClearButton();
		this.dispatchFilterChange();
	}

	/**
	 * Toggles an ID in the given Set.
	 *
	 * @param {Set<number>} set
	 * @param {number}      value
	 */
	toggleFilter( set, value ) {
		if ( set.has( value ) ) {
			set.delete( value );
		} else {
			set.add( value );
		}
	}

	/** @param {HTMLElement} btn */
	updateButtonState( btn ) {
		const type = btn.dataset.filterType;
		const value = parseInt( btn.dataset.filterValue, 10 );

		const set = type === 'category' ? this.selectedCategories : this.selectedTags;
		const isActive = set.has( value );

		btn.classList.toggle( 'is-active', isActive );
		btn.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
	}

	updateClearButton() {
		const clearBtn = this.el.querySelector( '.nrpb-posts-filter__clear' );
		if ( ! clearBtn ) return;

		const hasFilters =
			this.selectedCategories.size > 0 || this.selectedTags.size > 0;

		clearBtn.hidden = ! hasFilters;
	}

	clearFilters() {
		this.selectedCategories.clear();
		this.selectedTags.clear();

		this.el.querySelectorAll( '.nrpb-posts-filter__btn' ).forEach( ( btn ) => {
			btn.classList.remove( 'is-active' );
			btn.setAttribute( 'aria-pressed', 'false' );
		} );

		this.updateClearButton();
		this.dispatchFilterChange();
	}

	dispatchFilterChange() {
		document.dispatchEvent(
			new CustomEvent( 'nrpb:filter-change', {
				bubbles: false,
				detail: {
					blockId: this.blockId,
					categories: [ ...this.selectedCategories ],
					tags: [ ...this.selectedTags ],
				},
			} )
		);
	}
}
