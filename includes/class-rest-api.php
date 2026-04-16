<?php
/**
 * REST API endpoints for dynamic post fetching.
 *
 * @package NRPostsBlocks
 */

declare( strict_types=1 );

namespace NRPostsBlocks;

/**
 * Registers REST API routes for the frontend filter/grid communication.
 */
class REST_API {

	private const NAMESPACE = 'nrpb/v1';

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
		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/posts',
			[
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => [ $this, 'get_posts' ],
				'permission_callback' => '__return_true',
				'args'                => $this->get_posts_args(),
			]
		);
	}

	/**
	 * Returns schema for the /posts endpoint arguments.
	 *
	 * @return array<string, mixed>
	 */
	private function get_posts_args(): array {
		return [
			'page'           => [
				'default'           => 1,
				'sanitize_callback' => 'absint',
				'validate_callback' => fn( $v ) => is_numeric( $v ) && $v > 0,
			],
			'posts_per_page' => [
				'default'           => 6,
				'sanitize_callback' => 'absint',
				'validate_callback' => fn( $v ) => is_numeric( $v ) && $v > 0 && $v <= 100,
			],
			'categories'     => [
				'default'           => [],
				'sanitize_callback' => [ $this, 'sanitize_id_array' ],
			],
			'tags'           => [
				'default'           => [],
				'sanitize_callback' => [ $this, 'sanitize_id_array' ],
			],
		];
	}

	/**
	 * Sanitizes an array of integer IDs.
	 *
	 * @param mixed $value Raw input value.
	 * @return int[]
	 */
	public function sanitize_id_array( mixed $value ): array {
		if ( ! is_array( $value ) ) {
			$value = explode( ',', (string) $value );
		}
		return array_values( array_filter( array_map( 'absint', $value ) ) );
	}

	/**
	 * Handles GET /nrpb/v1/posts.
	 *
	 * @param \WP_REST_Request $request Incoming request.
	 * @return \WP_REST_Response
	 */
	public function get_posts( \WP_REST_Request $request ): \WP_REST_Response {
		$page           = $request->get_param( 'page' );
		$posts_per_page = $request->get_param( 'posts_per_page' );
		$category_ids   = $request->get_param( 'categories' );
		$tag_ids        = $request->get_param( 'tags' );

		$query_args = [
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => $posts_per_page,
			'paged'          => $page,
			'has_password'   => false,
			'tax_query'      => $this->build_tax_query( $category_ids, $tag_ids ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		];

		$query = new \WP_Query( $query_args );

		$posts = [];
		foreach ( $query->posts as $post ) {
			$posts[] = $this->format_post( $post );
		}

		return rest_ensure_response(
			[
				'posts'       => $posts,
				'total'       => (int) $query->found_posts,
				'total_pages' => (int) $query->max_num_pages,
				'page'        => $page,
			]
		);
	}

	/**
	 * Builds the tax_query array.
	 * Logic: OR within same type, AND across types.
	 *
	 * @param int[] $category_ids Selected category IDs.
	 * @param int[] $tag_ids      Selected tag IDs.
	 * @return array<mixed>
	 */
	private function build_tax_query( array $category_ids, array $tag_ids ): array {
		$clauses = [];

		if ( ! empty( $category_ids ) ) {
			$clauses[] = [
				'taxonomy' => 'category',
				'field'    => 'term_id',
				'terms'    => $category_ids,
				'operator' => 'IN', // OR within categories.
			];
		}

		if ( ! empty( $tag_ids ) ) {
			$clauses[] = [
				'taxonomy' => 'post_tag',
				'field'    => 'term_id',
				'terms'    => $tag_ids,
				'operator' => 'IN', // OR within tags.
			];
		}

		// No filters selected → no tax constraint.
		if ( empty( $clauses ) ) {
			return [];
		}

		// Single clause → relation key is meaningless and potentially ambiguous.
		if ( count( $clauses ) === 1 ) {
			return $clauses;
		}

		// Two clauses → AND between category and tag constraints.
		return array_merge( [ 'relation' => 'AND' ], $clauses );
	}

	/**
	 * Formats a WP_Post object for the REST response.
	 *
	 * @param \WP_Post $post Post object.
	 * @return array<string, mixed>
	 */
	private function format_post( \WP_Post $post ): array {
		$thumbnail_id  = get_post_thumbnail_id( $post->ID );
		$thumbnail_url = $thumbnail_id
			? wp_get_attachment_image_url( $thumbnail_id, 'medium_large' )
			: '';

		$thumbnail_alt = $thumbnail_id
			? (string) get_post_meta( $thumbnail_id, '_wp_attachment_image_alt', true )
			: '';

		$categories = wp_get_post_categories( $post->ID, [ 'fields' => 'all' ] );
		$tags       = wp_get_post_tags( $post->ID, [ 'fields' => 'all' ] );

		return [
			'id'            => $post->ID,
			'title'         => get_the_title( $post ),
			'excerpt'       => wp_strip_all_tags( get_the_excerpt( $post ) ),
			'permalink'     => get_permalink( $post ),
			'thumbnail_url' => $thumbnail_url ?: '',
			'thumbnail_alt' => $thumbnail_alt,
			'categories'    => array_map(
				fn( $term ) => [ 'id' => $term->term_id, 'name' => $term->name, 'slug' => $term->slug ],
				is_array( $categories ) ? $categories : []
			),
			'tags'          => array_map(
				fn( $term ) => [ 'id' => $term->term_id, 'name' => $term->name, 'slug' => $term->slug ],
				is_array( $tags ) ? $tags : []
			),
		];
	}
}
