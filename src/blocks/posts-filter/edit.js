import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { useEffect } from '@wordpress/element';
import { Placeholder, Spinner } from '@wordpress/components';

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { blockId } = attributes;

	// Assign stable blockId on mount.
	useEffect( () => {
		if ( ! blockId ) {
			setAttributes( { blockId: `nrpb-${ clientId.slice( 0, 8 ) }` } );
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	const { categories, tags, isLoading } = useSelect( ( select ) => {
		const store = select( coreStore );
		const cats = store.getEntityRecords( 'taxonomy', 'category', {
			per_page: 100,
			hide_empty: true,
		} );
		const tagList = store.getEntityRecords( 'taxonomy', 'post_tag', {
			per_page: 100,
			hide_empty: true,
		} );

		return {
			categories: cats ?? [],
			tags: tagList ?? [],
			isLoading: ! cats || ! tagList,
		};
	}, [] );

	const blockProps = useBlockProps( { className: 'nrpb-posts-filter' } );

	if ( isLoading ) {
		return (
			<div { ...blockProps }>
				<Placeholder label={ __( 'Posts Filter', 'nr-posts-blocks' ) }>
					<Spinner />
				</Placeholder>
			</div>
		);
	}

	return (
		<div { ...blockProps }>
			{ categories.length > 0 && (
				<div className="nrpb-posts-filter__group">
					<h4 className="nrpb-posts-filter__label">
						{ __( 'Categories', 'nr-posts-blocks' ) }
					</h4>
					<ul className="nrpb-posts-filter__list">
						{ categories.map( ( cat ) => (
							<li key={ cat.id }>
								<button
									className="nrpb-posts-filter__btn"
									disabled
								>
									{ cat.name }
									<span className="nrpb-posts-filter__count">
										({ cat.count })
									</span>
								</button>
							</li>
						) ) }
					</ul>
				</div>
			) }

			{ tags.length > 0 && (
				<div className="nrpb-posts-filter__group">
					<h4 className="nrpb-posts-filter__label">
						{ __( 'Tags', 'nr-posts-blocks' ) }
					</h4>
					<ul className="nrpb-posts-filter__list">
						{ tags.map( ( tag ) => (
							<li key={ tag.id }>
								<button
									className="nrpb-posts-filter__btn"
									disabled
								>
									{ tag.name }
									<span className="nrpb-posts-filter__count">
										({ tag.count })
									</span>
								</button>
							</li>
						) ) }
					</ul>
				</div>
			) }

			<p className="nrpb-posts-filter__editor-hint">
				{ __(
					'Filter interactions are active on the frontend.',
					'nr-posts-blocks'
				) }
			</p>
		</div>
	);
}
