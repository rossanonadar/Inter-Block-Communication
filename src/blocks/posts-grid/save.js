import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

/**
 * Save returns null because this is a dynamic block —
 * the PHP render_callback handles all output.
 * InnerBlocks.Content is saved so the pagination block markup
 * is stored in post_content and passed to the render callback.
 */
export default function Save( { attributes } ) {
	const { columns, blockId } = attributes;

	return (
		<div
			{ ...useBlockProps.save( {
				style: { '--nrpb-columns': columns },
				'data-block-id': blockId,
			} ) }
		>
			<div className="nrpb-posts-grid__inner"></div>
			<div className="nrpb-posts-grid__pagination">
				<InnerBlocks.Content />
			</div>
		</div>
	);
}
