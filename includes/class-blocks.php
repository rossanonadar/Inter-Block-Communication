<?php
/**
 * Blocks registration and asset enqueueing.
 *
 * @package NRPostsBlocks
 */

declare( strict_types=1 );

namespace NRPostsBlocks;

/**
 * Handles block registration.
 */
class Blocks {

	/** @var self|null */
	private static ?self $instance = null;

	// Separate counters for filters and grids — incremented on each render call.
	// The Nth filter and Nth grid on the page share the same pair key, enabling
	// automatic communication without any editor configuration.
	private static int $filter_index = 0;
	private static int $grid_index   = 0;

	private function __construct() {}

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	public function init(): void {
		add_action( 'init', [ $this, 'register_blocks' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_frontend_assets' ] );
	}

	/**
	 * Registers all plugin blocks via block.json metadata.
	 */
	public function register_blocks(): void {
		$blocks = [
			'posts-grid',
			'posts-filter',
			'pagination',
		];

		foreach ( $blocks as $block ) {
			// Register from build/ — block.json and compiled assets live together.
			register_block_type(
				NRPB_BUILD_DIR . $block . '.block.json',
				$this->get_block_args( $block )
			);
		}
	}

	/**
	 * Returns render callback and any extra args per block.
	 *
	 * @param string $block Block slug.
	 * @return array<string, mixed>
	 */
	private function get_block_args( string $block ): array {
		$callbacks = [
			'posts-grid'   => [ $this, 'render_posts_grid' ],
			'posts-filter' => [ $this, 'render_posts_filter' ],
			'pagination'   => [ $this, 'render_pagination' ],
		];

		return isset( $callbacks[ $block ] )
			? [ 'render_callback' => $callbacks[ $block ] ]
			: [];
	}

	/**
	 * Render callback for the Posts Grid block.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param string               $content    Inner blocks content.
	 * @return string
	 */
	public function render_posts_grid( array $attributes, string $content ): string {
		$columns        = absint( $attributes['columns'] ?? 3 );
		$posts_per_page = absint( $attributes['postsPerPage'] ?? 6 );
		$paged          = absint( get_query_var( 'nrpb_page', 1 ) );
		$block_id       = 'nrpb-pair-' . self::$grid_index++;

		$query_args = [
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => $posts_per_page,
			'paged'          => $paged,
			'has_password'   => false,
		];

		$query = new \WP_Query( $query_args );

		// Expose REST URL, nonce, and default category ID via the Interactivity API
		// config so view.js can use getConfig('nrpb') instead of window.nrpbData.
		// wp_interactivity_config() deep-merges, so multiple grid blocks are safe.
		wp_interactivity_config(
			'nrpb',
			[
				'restUrl'           => esc_url_raw( rest_url( 'nrpb/v1' ) ),
				'nonce'             => wp_create_nonce( 'wp_rest' ),
				'defaultCategoryId' => (int) get_option( 'default_category' ),
			]
		);

		// Seed per-instance state so the JS store has the right defaults before
		// any user interaction. wp_interactivity_state() deep-merges on each call,
		// so multiple grid blocks on the same page each register their own entry.
		wp_interactivity_state(
			'nrpb',
			[
				'filters' => [
					$block_id => [
						'categories' => [],
						'tags'       => [],
						'page'       => 1,
					],
				],
				'grids'   => [
					$block_id => [
						'postsPerPage' => $posts_per_page,
						'totalPages'   => (int) $query->max_num_pages,
					],
				],
				'loadingBlocks' => [],
				'posts'      => [ $block_id => [] ],
				'pagination' => [ $block_id => [] ],
				'hasFetched' => [ $block_id => false ],
				'hasResults' => [ $block_id => false ],
				'hasError'   => [ $block_id => false ],
			]
		);

		ob_start();
		?>
		<div
			class="nrpb-posts-grid"
			data-wp-interactive="nrpb"
			<?php echo wp_interactivity_data_wp_context( [ 'blockId' => $block_id, 'postsPerPage' => $posts_per_page ] ); ?>
			data-wp-init="callbacks.initGrid"
			data-wp-class--is-loading="state.isLoading"
			data-wp-bind--aria-busy="state.isLoading"
			data-columns="<?php echo esc_attr( (string) $columns ); ?>"
			data-posts-per-page="<?php echo esc_attr( (string) $posts_per_page ); ?>"
			data-block-id="<?php echo esc_attr( $block_id ); ?>"
			style="--nrpb-columns: <?php echo esc_attr( (string) $columns ); ?>;"
		>
			<div class="nrpb-posts-grid__inner">
				<?php if ( $query->have_posts() ) : ?>
					<?php while ( $query->have_posts() ) : $query->the_post(); ?>
						<?php $this->render_post_card(); ?>
					<?php endwhile; ?>
					<?php wp_reset_postdata(); ?>
				<?php else : ?>
					<p class="nrpb-posts-grid__no-results"
					   data-wp-class--is-hidden="state.ssrIsHidden">
						<?php esc_html_e( 'No posts found.', 'nr-posts-blocks' ); ?>
					</p>
				<?php endif; ?>

				<template
					data-wp-each--post="state.currentPosts"
					data-wp-each-key="context.post.id"
				>
					<article class="nrpb-post-card">
						<div class="nrpb-post-card__image"
							 data-wp-class--is-hidden="!state.postHasImage">
							<a data-wp-bind--href="context.post.permalink"
							   tabindex="-1" aria-hidden="true">
								<img data-wp-bind--src="context.post.thumbnail_url"
									 data-wp-bind--alt="context.post.thumbnail_alt"
									 loading="lazy" />
							</a>
						</div>

						<div class="nrpb-post-card__body">
							<span class="nrpb-post-card__category"
								  data-wp-class--is-hidden="!state.postHasPrimaryCategory"
								  data-wp-text="state.postPrimaryCategory.name">
							</span>

							<h3 class="nrpb-post-card__title">
								<a data-wp-bind--href="context.post.permalink"
								   data-wp-text="context.post.title"></a>
							</h3>

							<div class="nrpb-post-card__excerpt">
								<p data-wp-text="context.post.excerpt"></p>
							</div>

							<div class="nrpb-post-card__tags"
								 data-wp-class--is-hidden="!state.postHasTags"
								 aria-label="<?php esc_attr_e( 'Tags', 'nr-posts-blocks' ); ?>">
								<template data-wp-each--tag="state.postTags"
										  data-wp-each-key="context.tag.id">
									<span class="nrpb-post-card__tag"
										  data-wp-text="context.tag.name"></span>
								</template>
							</div>

							<a class="nrpb-post-card__read-more"
							   data-wp-bind--href="context.post.permalink">
								<?php esc_html_e( 'Read more', 'nr-posts-blocks' ); ?>
							</a>
						</div>
					</article>
				</template>

				<p class="nrpb-posts-grid__no-results is-hidden"
				   data-wp-class--is-hidden="!state.showNoResults">
					<?php esc_html_e( 'No posts found.', 'nr-posts-blocks' ); ?>
				</p>

				<p class="nrpb-posts-grid__error is-hidden"
				   data-wp-class--is-hidden="!state.showError">
					<?php esc_html_e( 'Something went wrong. Please try again.', 'nr-posts-blocks' ); ?>
				</p>
			</div>

			<div class="nrpb-posts-grid__pagination">
				<?php
				// $content is the rendered output of the nrpb/pagination inner block.
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo $content;
				?>
			</div>

			<p class="nrpb-posts-grid__status"
			   role="status"
			   aria-live="polite"
			   aria-atomic="true"
			   data-wp-text="state.statusMessage"></p>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Renders a single post card.
	 */
	private function render_post_card(): void {
		global $post;

		$categories = wp_get_post_categories( $post->ID, [ 'fields' => 'all' ] );
		$tags       = wp_get_post_tags( $post->ID, [ 'fields' => 'all' ] );

		$default_cat_id   = (int) get_option( 'default_category' );
		$valid_categories = is_array( $categories )
			? array_values( array_filter( $categories, fn( $c ) => $c->term_id !== $default_cat_id ) )
			: [];
		$primary_category = $valid_categories[0] ?? null;

		$has_image    = has_post_thumbnail();
		$has_category = ! empty( $primary_category );
		$has_tags     = ! empty( $tags );
		?>
		<article class="nrpb-post-card"
				 data-wp-class--is-hidden="state.ssrIsHidden"
				 data-post-id="<?php the_ID(); ?>">

			<div class="nrpb-post-card__image<?php echo $has_image ? '' : ' is-hidden'; ?>">
				<a href="<?php echo esc_url( get_permalink() ); ?>" tabindex="-1" aria-hidden="true">
					<?php if ( $has_image ) : ?>
						<?php the_post_thumbnail( 'medium_large' ); ?>
					<?php endif; ?>
				</a>
			</div>

			<div class="nrpb-post-card__body">
				<span class="nrpb-post-card__category<?php echo $has_category ? '' : ' is-hidden'; ?>">
					<?php echo $has_category ? esc_html( $primary_category->name ) : ''; ?>
				</span>

				<h3 class="nrpb-post-card__title">
					<a href="<?php echo esc_url( get_permalink() ); ?>"><?php echo esc_html( get_the_title() ); ?></a>
				</h3>

				<div class="nrpb-post-card__excerpt">
					<p><?php echo esc_html( wp_strip_all_tags( get_the_excerpt() ) ); ?></p>
				</div>

				<div class="nrpb-post-card__tags<?php echo $has_tags ? '' : ' is-hidden'; ?>"
					 aria-label="<?php esc_attr_e( 'Tags', 'nr-posts-blocks' ); ?>">
					<?php foreach ( $tags as $tag ) : ?>
						<span class="nrpb-post-card__tag"><?php echo esc_html( $tag->name ); ?></span>
					<?php endforeach; ?>
				</div>

				<a class="nrpb-post-card__read-more" href="<?php echo esc_url( get_permalink() ); ?>">
					<?php esc_html_e( 'Read more', 'nr-posts-blocks' ); ?>
				</a>
			</div>
		</article>
		<?php
	}

	/**
	 * Render callback for the Posts Filter block.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @return string
	 */
	public function render_posts_filter( array $attributes ): string {
		$block_id   = 'nrpb-pair-' . self::$filter_index++;
		$categories = get_terms(
			[
				'taxonomy'   => 'category',
				'hide_empty' => true,
				'exclude'    => [ get_option( 'default_category' ) ],
			]
		);

		$tags = get_terms(
			[
				'taxonomy'   => 'post_tag',
				'hide_empty' => true,
			]
		);

		if ( is_wp_error( $categories ) ) {
			$categories = [];
		}
		if ( is_wp_error( $tags ) ) {
			$tags = [];
		}

		// Seed per-instance filter state. The grid block seeds the same blockId
		// entry under state.filters; both calls deep-merge safely.
		wp_interactivity_state(
			'nrpb',
			[
				'filters' => [
					$block_id => [
						'categories' => [],
						'tags'       => [],
						'page'       => 1,
					],
				],
			]
		);

		ob_start();
		?>
		<div
			class="nrpb-posts-filter"
			data-wp-interactive="nrpb"
			<?php echo wp_interactivity_data_wp_context( [ 'blockId' => $block_id ] ); ?>
			data-wp-init="callbacks.initFilter"
			data-block-id="<?php echo esc_attr( $block_id ); ?>"
		>
			<?php if ( ! empty( $categories ) ) : ?>
				<div class="nrpb-posts-filter__group" data-filter-type="category">
					<h4 class="nrpb-posts-filter__label">
						<?php esc_html_e( 'Categories', 'nr-posts-blocks' ); ?>
					</h4>
					<ul class="nrpb-posts-filter__list" role="group" aria-label="<?php esc_attr_e( 'Filter by category', 'nr-posts-blocks' ); ?>">
						<?php foreach ( $categories as $category ) : ?>
							<li>
								<button
									class="nrpb-posts-filter__btn"
									data-filter-type="category"
									data-filter-value="<?php echo esc_attr( (string) $category->term_id ); ?>"
									<?php echo wp_interactivity_data_wp_context( [ 'blockId' => $block_id, 'filterId' => (int) $category->term_id, 'filterType' => 'category' ] ); ?>
									data-wp-on--click="actions.toggleFilter"
									data-wp-class--is-active="state.isFilterActive"
									data-wp-bind--aria-pressed="state.isFilterActive"
									aria-pressed="false"
								>
									<?php echo esc_html( $category->name ); ?>
									<span class="nrpb-posts-filter__count">(<?php echo esc_html( (string) $category->count ); ?>)</span>
								</button>
							</li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endif; ?>

			<?php if ( ! empty( $tags ) ) : ?>
				<div class="nrpb-posts-filter__group" data-filter-type="tag">
					<h4 class="nrpb-posts-filter__label">
						<?php esc_html_e( 'Tags', 'nr-posts-blocks' ); ?>
					</h4>
					<ul class="nrpb-posts-filter__list" role="group" aria-label="<?php esc_attr_e( 'Filter by tag', 'nr-posts-blocks' ); ?>">
						<?php foreach ( $tags as $tag ) : ?>
							<li>
								<button
									class="nrpb-posts-filter__btn"
									data-filter-type="tag"
									data-filter-value="<?php echo esc_attr( (string) $tag->term_id ); ?>"
									<?php echo wp_interactivity_data_wp_context( [ 'blockId' => $block_id, 'filterId' => (int) $tag->term_id, 'filterType' => 'tag' ] ); ?>
									data-wp-on--click="actions.toggleFilter"
									data-wp-class--is-active="state.isFilterActive"
									data-wp-bind--aria-pressed="state.isFilterActive"
									aria-pressed="false"
								>
									<?php echo esc_html( $tag->name ); ?>
									<span class="nrpb-posts-filter__count">(<?php echo esc_html( (string) $tag->count ); ?>)</span>
								</button>
							</li>
						<?php endforeach; ?>
					</ul>
				</div>
			<?php endif; ?>

			<div class="nrpb-posts-filter__actions">
				<button
					class="nrpb-posts-filter__clear"
					type="button"
					<?php echo wp_interactivity_data_wp_context( [ 'blockId' => $block_id ] ); ?>
					data-wp-on--click="actions.clearFilters"
					data-wp-class--is-visible="state.hasActiveFilters"
					data-wp-bind--aria-hidden="!state.hasActiveFilters"
					data-wp-bind--tabindex="state.clearBtnTabIndex"
					aria-label="<?php esc_attr_e( 'Clear filters', 'nr-posts-blocks' ); ?>"
					aria-hidden="true"
					tabindex="-1"
				></button>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Render callback for the Pagination block.
	 *
	 * Reads postsPerPage from block context (provided by the parent posts-grid block
	 * via providesContext) and runs a lightweight count-only query to determine
	 * total_pages. This keeps pagination self-contained as a true inner block.
	 *
	 * @param array<string, mixed> $attributes Block attributes (unused).
	 * @param string               $content    Inner content (empty for this block).
	 * @param \WP_Block            $block      Block instance — carries context from parent.
	 * @return string
	 */
	public function render_pagination( array $attributes, string $content, \WP_Block $block ): string {
		$posts_per_page = absint( $block->context['nrpb/postsPerPage'] ?? 6 );
		$block_id       = (string) ( $block->context['nrpb/blockId'] ?? '' );
		$paged          = absint( get_query_var( 'nrpb_page', 1 ) );

		// Lightweight count query — fetches IDs only, no meta/term cache warmup.
		$count_query = new \WP_Query(
			[
				'post_type'              => 'post',
				'post_status'            => 'publish',
				'posts_per_page'         => $posts_per_page,
				'paged'                  => $paged,
				'has_password'           => false,
				'fields'                 => 'ids',
				'no_found_rows'          => false,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			]
		);

		return $this->render_pagination_html( $paged, (int) $count_query->max_num_pages );
	}

	/**
	 * Builds the pagination HTML for SSR + dynamic progressive enhancement.
	 *
	 * Two nav elements are rendered:
	 * 1. SSR nav — visible on load, hidden (via data-wp-class) after the first JS fetch.
	 * 2. Dynamic nav — hidden on load, shown after the first JS fetch; page buttons are
	 *    rendered declaratively via data-wp-each--btn from state.currentPaginationPages.
	 *
	 * @param int $current_page Current page number.
	 * @param int $total_pages  Total number of pages.
	 * @return string
	 */
	private function render_pagination_html( int $current_page, int $total_pages ): string {
		$label     = esc_attr__( 'Posts navigation', 'nr-posts-blocks' );
		$prev_aria = esc_attr__( 'Previous page', 'nr-posts-blocks' );
		$next_aria = esc_attr__( 'Next page', 'nr-posts-blocks' );

		// ----- SSR nav ----------------------------------------------------------
		$ssr = '<div class="nrpb-pagination"'
			. ' data-wp-class--is-hidden="state.ssrIsHidden"'
			. ' aria-label="' . $label . '">';

		if ( $total_pages > 1 ) {
			$prev_disabled = $current_page <= 1 ? ' disabled aria-disabled="true"' : '';
			$ssr .= sprintf(
				'<button class="nrpb-pagination__btn nrpb-pagination__btn--prev"%s aria-label="%s" data-wp-context=\'{"btn":{"page":%d,"isCurrent":false}}\' data-wp-on--click="actions.goToPage">&#8592; Prev</button>',
				$prev_disabled,
				$prev_aria,
				max( 1, $current_page - 1 )
			);

			for ( $i = 1; $i <= $total_pages; $i++ ) {
				$is_active    = $i === $current_page;
				$active_class = $is_active ? ' is-active' : '';
				$aria_current = $is_active ? ' aria-current="page"' : '';
				$ssr .= sprintf(
					'<button class="nrpb-pagination__btn nrpb-pagination__btn--page%s" aria-label="%s"%s data-wp-context=\'{"btn":{"page":%d,"isCurrent":%s}}\' data-wp-on--click="actions.goToPage">%d</button>',
					$active_class,
					/* translators: %d: page number */
					esc_attr( sprintf( __( 'Page %d', 'nr-posts-blocks' ), $i ) ),
					$aria_current,
					$i,
					$is_active ? 'true' : 'false',
					$i
				);
			}

			$next_disabled = $current_page >= $total_pages ? ' disabled aria-disabled="true"' : '';
			$ssr .= sprintf(
				'<button class="nrpb-pagination__btn nrpb-pagination__btn--next"%s aria-label="%s" data-wp-context=\'{"btn":{"page":%d,"isCurrent":false}}\' data-wp-on--click="actions.goToPage">Next &#8594;</button>',
				$next_disabled,
				$next_aria,
				min( $total_pages, $current_page + 1 )
			);
		}

		$ssr .= '</div>';

		// ----- Dynamic nav (JS takes over after first fetch) --------------------
		$dyn = '<div class="nrpb-pagination is-hidden"'
			. ' data-wp-class--is-hidden="!state.ssrIsHidden"'
			. ' aria-label="' . $label . '">'

			. '<button class="nrpb-pagination__btn nrpb-pagination__btn--prev"'
			. ' data-wp-on--click="actions.prevPage"'
			. ' data-wp-bind--disabled="state.prevBtnIsDisabled"'
			. ' data-wp-bind--aria-disabled="state.prevBtnIsDisabled"'
			. ' aria-label="' . $prev_aria . '">&#8592; Prev</button>'

			. '<template'
			. ' data-wp-each--btn="state.currentPaginationPages"'
			. ' data-wp-each-key="context.btn.page">'
			. '<button class="nrpb-pagination__btn nrpb-pagination__btn--page"'
			. ' data-wp-class--is-active="context.btn.isCurrent"'
			. ' data-wp-bind--aria-current="state.paginationBtnAriaCurrent"'
			. ' data-wp-on--click="actions.goToPage"'
			. ' data-wp-text="context.btn.page"></button>'
			. '</template>'

			. '<button class="nrpb-pagination__btn nrpb-pagination__btn--next"'
			. ' data-wp-on--click="actions.nextPage"'
			. ' data-wp-bind--disabled="state.nextBtnIsDisabled"'
			. ' data-wp-bind--aria-disabled="state.nextBtnIsDisabled"'
			. ' aria-label="' . $next_aria . '">Next &#8594;</button>'

			. '</div>';

		return $ssr . $dyn;
	}

	/**
	 * Enqueues frontend-only assets.
	 */
	public function enqueue_frontend_assets(): void {
		if ( ! has_block( 'nrpb/posts-grid' ) && ! has_block( 'nrpb/posts-filter' ) ) {
			return;
		}

		wp_enqueue_script(
			'nrpb-frontend',
			NRPB_BUILD_URL . 'frontend.js',
			[],
			NRPB_VERSION,
			true
		);

		if ( file_exists( NRPB_BUILD_DIR . 'frontend.css' ) ) {
			wp_enqueue_style(
				'nrpb-frontend',
				NRPB_BUILD_URL . 'frontend.css',
				[],
				NRPB_VERSION
			);
		}
	}
}
