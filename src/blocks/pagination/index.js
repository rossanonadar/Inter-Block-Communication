import { registerBlockType } from '@wordpress/blocks';
import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import metadata from './block.json';

function Edit() {
	return (
		<div { ...useBlockProps( { className: 'nrpb-pagination' } ) }>
			<span className="nrpb-pagination__editor-hint">
				{ __( 'Pagination (rendered on frontend)', 'nr-posts-blocks' ) }
			</span>
		</div>
	);
}

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => (
		<div { ...useBlockProps.save( { className: 'nrpb-pagination' } ) }></div>
	),
} );
