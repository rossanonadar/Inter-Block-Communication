<?php
/**
 * Plugin Name:       NR Posts Blocks
 * Plugin URI:        https://github.com/nadarrossano/nr-posts-blocks
 * Description:       Dynamic Posts Grid and Filter Gutenberg blocks with demo content seeding.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      8.0
 * Author:            Nadar Rossano
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       nr-posts-blocks
 *
 * @package NRPostsBlocks
 */

declare( strict_types=1 );

namespace NRPostsBlocks;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NRPB_VERSION', '1.0.0' );
define( 'NRPB_PLUGIN_FILE', __FILE__ );
define( 'NRPB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'NRPB_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'NRPB_BUILD_DIR', NRPB_PLUGIN_DIR . 'build/' );
define( 'NRPB_BUILD_URL', NRPB_PLUGIN_URL . 'build/' );
define( 'NRPB_PREFIX', 'nrpb' );

require_once NRPB_PLUGIN_DIR . 'includes/class-blocks.php';
require_once NRPB_PLUGIN_DIR . 'includes/class-rest-api.php';
require_once NRPB_PLUGIN_DIR . 'includes/class-seeder.php';

/**
 * Bootstraps the plugin.
 */
function bootstrap(): void {
	Blocks::get_instance()->init();
	REST_API::get_instance()->init();
}
add_action( 'plugins_loaded', __NAMESPACE__ . '\\bootstrap' );

/**
 * Runs on plugin activation.
 */
function on_activation(): void {
	Seeder::get_instance()->run();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, __NAMESPACE__ . '\\on_activation' );
