import { InnerBlocks } from '@wordpress/block-editor';

/**
 * Dynamic block — PHP render_callback outputs the full wrapper.
 * save() returns only InnerBlocks.Content so the pagination inner block
 * is persisted in post_content and passed to the render callback.
 *
 * Serialized format:
 *   <!-- wp:nrpb/posts-grid {...} -->
 *   <!-- wp:nrpb/pagination /-->
 *   <!-- /wp:nrpb/posts-grid -->
 */
export default function Save() {
	return <InnerBlocks.Content />;
}
