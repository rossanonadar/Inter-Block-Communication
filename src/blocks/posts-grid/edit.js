import { __ } from '@wordpress/i18n';
import {
	useBlockProps,
	InspectorControls,
	InnerBlocks,
} from '@wordpress/block-editor';
import {
	PanelBody,
	RangeControl,
	SelectControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';

const ALLOWED_BLOCKS = [ 'nrpb/pagination' ];
const PAGINATION_TEMPLATE = [ [ 'nrpb/pagination' ] ];

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { columns, postsPerPage, blockId } = attributes;
	const [ posts, setPosts ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );

	// Assign a stable blockId based on clientId once on mount.
	useEffect( () => {
		if ( ! blockId ) {
			setAttributes( { blockId: `nrpb-${ clientId.slice( 0, 8 ) }` } );
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect( () => {
		setIsLoading( true );
		apiFetch( {
			path: addQueryArgs( '/nrpb/v1/posts', {
				posts_per_page: postsPerPage,
				page: 1,
			} ),
		} )
			.then( ( response ) => {
				setPosts( response.posts || [] );
			} )
			.catch( () => setPosts( [] ) )
			.finally( () => setIsLoading( false ) );
	}, [ postsPerPage ] );

	const blockProps = useBlockProps( {
		className: `nrpb-posts-grid`,
		style: { '--nrpb-columns': columns },
	} );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Grid Settings', 'nr-posts-blocks' ) }>
					<SelectControl
						label={ __( 'Columns', 'nr-posts-blocks' ) }
						value={ columns }
						options={ [
							{ label: __( '2 Columns', 'nr-posts-blocks' ), value: 2 },
							{ label: __( '3 Columns', 'nr-posts-blocks' ), value: 3 },
							{ label: __( '4 Columns', 'nr-posts-blocks' ), value: 4 },
						] }
						onChange={ ( value ) =>
							setAttributes( { columns: parseInt( value, 10 ) } )
						}
					/>
					<RangeControl
						label={ __( 'Posts per page', 'nr-posts-blocks' ) }
						value={ postsPerPage }
						onChange={ ( value ) =>
							setAttributes( { postsPerPage: value } )
						}
						min={ 2 }
						max={ 12 }
					/>
				</PanelBody>
			</InspectorControls>

			<div { ...blockProps }>
				{ isLoading ? (
					<Placeholder>
						<Spinner />
					</Placeholder>
				) : (
					<div className="nrpb-posts-grid__inner">
						{ posts.length > 0 ? (
							posts.map( ( post ) => (
								<article
									key={ post.id }
									className="nrpb-post-card nrpb-post-card--editor"
								>
									{ post.thumbnail_url && (
										<div className="nrpb-post-card__image">
											<img
												src={ post.thumbnail_url }
												alt={ post.thumbnail_alt }
											/>
										</div>
									) }
									<div className="nrpb-post-card__body">
										<h3 className="nrpb-post-card__title">
											{ post.title }
										</h3>
										<p className="nrpb-post-card__excerpt">
											{ post.excerpt }
										</p>
									</div>
								</article>
							) )
						) : (
							<p>{ __( 'No posts found.', 'nr-posts-blocks' ) }</p>
						) }
					</div>
				) }

				<div className="nrpb-posts-grid__pagination">
					<InnerBlocks
						allowedBlocks={ ALLOWED_BLOCKS }
						template={ PAGINATION_TEMPLATE }
						templateLock="all"
					/>
				</div>
			</div>
		</>
	);
}
