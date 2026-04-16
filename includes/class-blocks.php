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

		$query_args = [
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => $posts_per_page,
			'paged'          => $paged,
			'has_password'   => false,
		];

		$query = new \WP_Query( $query_args );

		ob_start();
		?>
		<div
			class="nrpb-posts-grid"
			data-columns="<?php echo esc_attr( (string) $columns ); ?>"
			data-posts-per-page="<?php echo esc_attr( (string) $posts_per_page ); ?>"
			data-block-id="<?php echo esc_attr( $attributes['blockId'] ?? '' ); ?>"
			style="--nrpb-columns: <?php echo esc_attr( (string) $columns ); ?>;"
		>
			<div class="nrpb-posts-grid__inner">
				<?php if ( $query->have_posts() ) : ?>
					<?php while ( $query->have_posts() ) : $query->the_post(); ?>
						<?php $this->render_post_card(); ?>
					<?php endwhile; ?>
					<?php wp_reset_postdata(); ?>
				<?php else : ?>
					<p class="nrpb-posts-grid__no-results">
						<?php esc_html_e( 'No posts found.', 'nr-posts-blocks' ); ?>
					</p>
				<?php endif; ?>
			</div>

			<?php if ( ! empty( $content ) ) : ?>
				<div class="nrpb-posts-grid__pagination">
					<?php
					// Inner blocks output (pagination block).
					echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					?>
				</div>
			<?php endif; ?>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Renders a single post card.
	 */
	private function render_post_card(): void {
		?>
		<article class="nrpb-post-card" data-post-id="<?php the_ID(); ?>">
			<?php if ( has_post_thumbnail() ) : ?>
				<div class="nrpb-post-card__image">
					<a href="<?php the_permalink(); ?>" tabindex="-1" aria-hidden="true">
						<?php the_post_thumbnail( 'medium_large' ); ?>
					</a>
				</div>
			<?php endif; ?>

			<div class="nrpb-post-card__body">
				<h3 class="nrpb-post-card__title">
					<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
				</h3>

				<div class="nrpb-post-card__excerpt">
					<?php the_excerpt(); ?>
				</div>

				<a class="nrpb-post-card__read-more" href="<?php the_permalink(); ?>">
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

		ob_start();
		?>
		<div
			class="nrpb-posts-filter"
			data-block-id="<?php echo esc_attr( $attributes['blockId'] ?? '' ); ?>"
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
					aria-label="<?php esc_attr_e( 'Clear filters', 'nr-posts-blocks' ); ?>"
					aria-hidden="true"
				></button>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Render callback for the Pagination block.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @return string
	 */
	public function render_pagination( array $attributes ): string {
		return '<div class="nrpb-pagination" aria-label="' . esc_attr__( 'Posts navigation', 'nr-posts-blocks' ) . '"></div>';
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

		wp_localize_script(
			'nrpb-frontend',
			'nrpbData',
			[
				'restUrl' => esc_url_raw( rest_url( 'nrpb/v1' ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			]
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
