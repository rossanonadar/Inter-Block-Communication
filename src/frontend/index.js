/**
 * Frontend entry point.
 *
 * Inter-block communication strategy: CustomEvent bus via document.
 *
 * The Filter block dispatches a `nrpb:filter-change` CustomEvent on the
 * document with the selected filters as detail. The Grid block listens for
 * that same event and re-fetches posts. Both blocks identify themselves with
 * a `data-block-id` attribute set at save time — the filter targets the grid
 * with the matching blockId, so multiple independent pairs can coexist on
 * the same page without interference.
 *
 * This approach was chosen over:
 * - URL params: would require a page reload and pollute the URL.
 * - localStorage/sessionStorage: async, no broadcast to same-tab listeners.
 * - WordPress block data store: not available outside the editor.
 * - Shared parent wrapper: would force a specific DOM structure.
 *
 * CustomEvent is synchronous, zero-dependency, and works regardless of where
 * in the DOM the two blocks are placed.
 */

import './style.scss';
import { PostsGrid } from './posts-grid';
import { PostsFilter } from './posts-filter';

document.addEventListener( 'DOMContentLoaded', () => {
	document
		.querySelectorAll( '.nrpb-posts-grid' )
		.forEach( ( el ) => new PostsGrid( el ) );

	document
		.querySelectorAll( '.nrpb-posts-filter' )
		.forEach( ( el ) => new PostsFilter( el ) );
} );
