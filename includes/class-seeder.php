<?php
/**
 * Demo content seeder — runs once on plugin activation.
 *
 * @package NRPostsBlocks
 */

declare( strict_types=1 );

namespace NRPostsBlocks;

/**
 * Creates demo posts, terms, images, and the demo page.
 */
class Seeder {

	private const SEEDED_FLAG = 'nrpb_seeded_v1';

	/** @var self|null */
	private static ?self $instance = null;

	private function __construct() {}

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Entry point — runs only once per install.
	 */
	public function run(): void {
		if ( get_option( self::SEEDED_FLAG ) ) {
			return;
		}

		$term_ids = $this->seed_terms();
		$this->seed_posts( $term_ids );
		$this->seed_demo_page();

		update_option( self::SEEDED_FLAG, true );
	}

	/**
	 * Creates demo categories and tags.
	 *
	 * @return array{categories: array<string, int>, tags: array<string, int>}
	 */
	private function seed_terms(): array {
		$categories = [
			'nrpb-technology' => 'Technology',
			'nrpb-design'     => 'Design',
			'nrpb-business'   => 'Business',
			'nrpb-science'    => 'Science',
		];

		$tags = [
			'nrpb-tutorial'    => 'Tutorial',
			'nrpb-tips'        => 'Tips',
			'nrpb-tools'       => 'Tools',
			'nrpb-trends'      => 'Trends',
			'nrpb-beginner'    => 'Beginner',
			'nrpb-advanced'    => 'Advanced',
			'nrpb-case-study'  => 'Case Study',
			'nrpb-inspiration' => 'Inspiration',
		];

		$term_ids = [
			'categories' => [],
			'tags'       => [],
		];

		foreach ( $categories as $slug => $name ) {
			$result = wp_insert_term( $name, 'category', [ 'slug' => $slug ] );
			$term_ids['categories'][ $slug ] = is_wp_error( $result )
				? ( $result->get_error_data( 'term_exists' )['term_id'] ?? 0 )
				: (int) $result['term_id'];
		}

		foreach ( $tags as $slug => $name ) {
			$result = wp_insert_term( $name, 'post_tag', [ 'slug' => $slug ] );
			$term_ids['tags'][ $slug ] = is_wp_error( $result )
				? ( $result->get_error_data( 'term_exists' )['term_id'] ?? 0 )
				: (int) $result['term_id'];
		}

		return $term_ids;
	}

	/**
	 * Creates 12 demo posts with varied term assignments.
	 *
	 * @param array{categories: array<string, int>, tags: array<string, int>} $term_ids Term IDs map.
	 */
	private function seed_posts( array $term_ids ): void {
		$c = $term_ids['categories'];
		$t = $term_ids['tags'];

		$posts = [
			[
				'title'      => 'Getting Started with React in WordPress Blocks',
				'excerpt'    => 'A step-by-step guide to building your first Gutenberg block using React and the WordPress block API.',
				'categories' => [ $c['nrpb-technology'] ],
				'tags'       => [ $t['nrpb-tutorial'], $t['nrpb-beginner'] ],
				'color'      => '4F46E5',
				'label'      => 'React',
			],
			[
				'title'      => 'Design Systems for the Modern Web',
				'excerpt'    => 'How to build a scalable design system that keeps your product consistent and your team aligned.',
				'categories' => [ $c['nrpb-design'], $c['nrpb-technology'] ],
				'tags'       => [ $t['nrpb-tools'], $t['nrpb-trends'] ],
				'color'      => 'EC4899',
				'label'      => 'Design',
			],
			[
				'title'      => 'WordPress REST API: A Deep Dive',
				'excerpt'    => 'Explore the full power of the WordPress REST API to build headless and decoupled applications.',
				'categories' => [ $c['nrpb-technology'] ],
				'tags'       => [ $t['nrpb-advanced'], $t['nrpb-tutorial'] ],
				'color'      => '0EA5E9',
				'label'      => 'WP API',
			],
			[
				'title'      => 'Growing a SaaS Business from Zero to One',
				'excerpt'    => 'Lessons learned from building a SaaS product — from idea validation to first paying customers.',
				'categories' => [ $c['nrpb-business'] ],
				'tags'       => [ $t['nrpb-case-study'], $t['nrpb-trends'] ],
				'color'      => '10B981',
				'label'      => 'SaaS',
			],
			[
				'title'      => 'The Science of Color in UI Design',
				'excerpt'    => 'Cognitive science meets interface design — how color choices impact user behavior and conversion.',
				'categories' => [ $c['nrpb-design'], $c['nrpb-science'] ],
				'tags'       => [ $t['nrpb-inspiration'], $t['nrpb-tips'] ],
				'color'      => 'F59E0B',
				'label'      => 'Color',
			],
			[
				'title'      => 'Advanced Webpack Configuration for WordPress',
				'excerpt'    => 'Optimize your WordPress theme and plugin build process with custom Webpack configurations.',
				'categories' => [ $c['nrpb-technology'] ],
				'tags'       => [ $t['nrpb-advanced'], $t['nrpb-tools'] ],
				'color'      => '6366F1',
				'label'      => 'Webpack',
			],
			[
				'title'      => 'Content Marketing Strategy That Actually Works',
				'excerpt'    => 'A data-driven approach to content marketing that generates leads without burning out your team.',
				'categories' => [ $c['nrpb-business'] ],
				'tags'       => [ $t['nrpb-tips'], $t['nrpb-trends'] ],
				'color'      => 'EF4444',
				'label'      => 'Marketing',
			],
			[
				'title'      => 'Neuroscience of Decision Making in UX',
				'excerpt'    => 'How understanding the brain\'s decision pathways can make your UX more intuitive and effective.',
				'categories' => [ $c['nrpb-science'], $c['nrpb-design'] ],
				'tags'       => [ $t['nrpb-advanced'], $t['nrpb-case-study'] ],
				'color'      => '8B5CF6',
				'label'      => 'UX Brain',
			],
			[
				'title'      => 'Building Accessible WordPress Blocks',
				'excerpt'    => 'Accessibility is not an afterthought. Learn how to build inclusive Gutenberg blocks from day one.',
				'categories' => [ $c['nrpb-technology'], $c['nrpb-design'] ],
				'tags'       => [ $t['nrpb-tutorial'], $t['nrpb-tips'] ],
				'color'      => '14B8A6',
				'label'      => 'A11y',
			],
			[
				'title'      => 'Remote Team Culture: Science-Backed Practices',
				'excerpt'    => 'What organizational psychology tells us about building high-performing distributed teams.',
				'categories' => [ $c['nrpb-business'], $c['nrpb-science'] ],
				'tags'       => [ $t['nrpb-tips'], $t['nrpb-beginner'] ],
				'color'      => 'F97316',
				'label'      => 'Remote',
			],
			[
				'title'      => 'CSS Grid vs Flexbox: When to Use What',
				'excerpt'    => 'A practical guide to choosing between CSS Grid and Flexbox for your layout challenges.',
				'categories' => [ $c['nrpb-technology'], $c['nrpb-design'] ],
				'tags'       => [ $t['nrpb-tutorial'], $t['nrpb-beginner'] ],
				'color'      => '06B6D4',
				'label'      => 'CSS',
			],
			[
				'title'      => 'AI Tools Reshaping the Design Industry',
				'excerpt'    => 'From Midjourney to Figma AI — how artificial intelligence is changing the workflow for designers.',
				'categories' => [ $c['nrpb-design'], $c['nrpb-business'] ],
				'tags'       => [ $t['nrpb-trends'], $t['nrpb-inspiration'] ],
				'color'      => 'A855F7',
				'label'      => 'AI',
			],
		];

		foreach ( $posts as $post_data ) {
			$post_id = wp_insert_post(
				[
					'post_title'   => $post_data['title'],
					'post_excerpt' => $post_data['excerpt'],
					'post_content' => '<p>' . $post_data['excerpt'] . '</p>',
					'post_status'  => 'publish',
					'post_type'    => 'post',
				],
				true
			);

			if ( is_wp_error( $post_id ) ) {
				continue;
			}

			wp_set_post_categories( $post_id, $post_data['categories'] );
			wp_set_post_tags( $post_id, [] );
			wp_set_object_terms( $post_id, $post_data['tags'], 'post_tag' );

			$attachment_id = $this->create_placeholder_image(
				$post_data['color'],
				$post_data['label'],
				$post_id
			);

			if ( $attachment_id ) {
				set_post_thumbnail( $post_id, $attachment_id );
			}
		}
	}

	/**
	 * Generates a coloured SVG placeholder and attaches it to a post.
	 *
	 * @param string $hex_color Background color (without #).
	 * @param string $label     Short text label for the image.
	 * @param int    $post_id   Post to attach to.
	 * @return int|false Attachment ID on success, false on failure.
	 */
	private function create_placeholder_image( string $hex_color, string $label, int $post_id ): int|false {
		$upload_dir = wp_upload_dir();

		if ( ! empty( $upload_dir['error'] ) ) {
			return false;
		}

		$safe_label = preg_replace( '/[^a-zA-Z0-9]/', '-', strtolower( $label ) );
		$filename   = 'nrpb-placeholder-' . $safe_label . '.svg';
		$filepath   = $upload_dir['path'] . '/' . $filename;

		// Determine readable text color.
		$text_color = $this->get_contrast_color( $hex_color );

		// Derive a slightly darker shade for the gradient stop.
		$r2 = max( 0, hexdec( substr( $hex_color, 0, 2 ) ) - 40 );
		$g2 = max( 0, hexdec( substr( $hex_color, 2, 2 ) ) - 40 );
		$b2 = max( 0, hexdec( substr( $hex_color, 4, 2 ) ) - 40 );
		$dark_color = sprintf( '%02x%02x%02x', $r2, $g2, $b2 );

		$svg = <<<SVG
		<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
			<defs>
				<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color="#{$hex_color}"/>
					<stop offset="100%" stop-color="#{$dark_color}"/>
				</linearGradient>
				<filter id="noise">
					<feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
					<feColorMatrix type="saturate" values="0"/>
					<feBlend in="SourceGraphic" mode="overlay" result="blend"/>
					<feComposite in="blend" in2="SourceGraphic" operator="in"/>
				</filter>
			</defs>
			<rect width="800" height="500" fill="url(#g)"/>
			<rect width="800" height="500" fill="#{$hex_color}" opacity="0.08" filter="url(#noise)"/>
			<!-- Decorative circles -->
			<circle cx="650" cy="80" r="120" fill="{$text_color}" opacity="0.06"/>
			<circle cx="150" cy="420" r="90" fill="{$text_color}" opacity="0.06"/>
			<circle cx="720" cy="400" r="60" fill="{$text_color}" opacity="0.04"/>
			<!-- Label pill -->
			<rect x="270" y="205" width="260" height="90" rx="45" fill="{$text_color}" opacity="0.15"/>
			<text
				x="400" y="258"
				font-family="system-ui, -apple-system, sans-serif"
				font-size="52"
				font-weight="800"
				fill="{$text_color}"
				text-anchor="middle"
				dominant-baseline="middle"
				letter-spacing="-1"
				opacity="0.92"
			>{$label}</text>
		</svg>
		SVG;

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		if ( false === file_put_contents( $filepath, $svg ) ) {
			return false;
		}

		$attachment = [
			'guid'           => $upload_dir['url'] . '/' . $filename,
			'post_mime_type' => 'image/svg+xml',
			'post_title'     => $label . ' placeholder',
			'post_content'   => '',
			'post_status'    => 'inherit',
		];

		$attachment_id = wp_insert_attachment( $attachment, $filepath, $post_id );

		if ( is_wp_error( $attachment_id ) ) {
			return false;
		}

		return $attachment_id;
	}

	/**
	 * Returns black or white based on luminance of the given hex color.
	 *
	 * @param string $hex_color Hex color without #.
	 * @return string '#000000' or '#ffffff'.
	 */
	private function get_contrast_color( string $hex_color ): string {
		$r = hexdec( substr( $hex_color, 0, 2 ) );
		$g = hexdec( substr( $hex_color, 2, 2 ) );
		$b = hexdec( substr( $hex_color, 4, 2 ) );

		// Relative luminance formula (WCAG).
		$luminance = ( 0.299 * $r + 0.587 * $g + 0.114 * $b ) / 255;

		return $luminance > 0.5 ? '#000000' : '#ffffff';
	}

	/**
	 * Creates a demo page with both blocks pre-placed.
	 */
	private function seed_demo_page(): void {
		$existing = get_page_by_path( 'nrpb-demo' );
		if ( $existing ) {
			return;
		}

		$block_content = $this->get_demo_page_content();

		wp_insert_post(
			[
				'post_title'   => 'Posts Blocks Demo',
				'post_name'    => 'nrpb-demo',
				'post_content' => $block_content,
				'post_status'  => 'publish',
				'post_type'    => 'page',
			]
		);
	}

	/**
	 * Returns the serialized block markup for the demo page.
	 *
	 * Both blocks use a shared blockId so the filter knows which grid to update.
	 *
	 * @return string
	 */
	private function get_demo_page_content(): string {
		return '<!-- wp:nrpb/posts-filter {"blockId":"nrpb-demo-01"} /-->

<!-- wp:nrpb/posts-grid {"blockId":"nrpb-demo-01","columns":3,"postsPerPage":6} -->
<!-- wp:nrpb/pagination /-->
<!-- /wp:nrpb/posts-grid -->';
	}
}
