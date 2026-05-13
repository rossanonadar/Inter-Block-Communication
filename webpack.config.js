const path = require( 'path' );
const MiniCssExtractPlugin = require( 'mini-css-extract-plugin' );
const CopyWebpackPlugin = require( 'copy-webpack-plugin' );

const isProduction = process.env.NODE_ENV === 'production';

// WordPress script handles that map to our externals.
// These become the `dependencies` array inside each .asset.php file,
// telling WordPress which scripts to load before ours.
// Module handle for the Interactivity API view script.
// WordPress needs this registered as a Script Module (type="module"), not a
// regular script. Webpack outputs it as an ES module; WordPress's Script
// Modules API enqueues it with the correct import map for @wordpress/interactivity.
const INTERACTIVITY_MODULE_ENTRY = 'nrpb-view';

const WP_DEPENDENCIES = {
	'posts-grid': [
		'wp-blocks',
		'wp-block-editor',
		'wp-components',
		'wp-element',
		'wp-i18n',
		'wp-api-fetch',
		'wp-url',
	],
	'posts-filter': [
		'wp-blocks',
		'wp-block-editor',
		'wp-components',
		'wp-element',
		'wp-i18n',
		'wp-core-data',
		'wp-data',
	],
	pagination: [
		'wp-blocks',
		'wp-block-editor',
		'wp-element',
		'wp-i18n',
	],
	frontend: [],
	// nrpb-view.js is an ES module built by the interactivity config.
	// WordPress reads nrpb-view.asset.php to discover its '@wordpress/interactivity'
	// dependency, which triggers the import map entry that lets the bare specifier
	// resolve in the browser. The main config emits this file via WordPressAssetPlugin.
	[ INTERACTIVITY_MODULE_ENTRY ]: [ '@wordpress/interactivity' ],
};

/**
 * Webpack plugin that emits a <name>.asset.php file for each entry.
 * WordPress reads this file to know the script's dependencies and version.
 */
class WordPressAssetPlugin {
	apply( compiler ) {
		compiler.hooks.emit.tapAsync( 'WordPressAssetPlugin', ( compilation, callback ) => {
			Object.keys( WP_DEPENDENCIES ).forEach( ( entry ) => {
				const deps    = WP_DEPENDENCIES[ entry ] ?? [];
				const version = compilation.hash ?? '1.0.0';

				const php = `<?php return array( 'dependencies' => ${ phpArray( deps ) }, 'version' => '${ version }' );`;

				compilation.assets[ `${ entry }.asset.php` ] = {
					source: () => php,
					size:   () => php.length,
				};
			} );
			callback();
		} );
	}
}

/** Converts a JS string array to a PHP array literal. */
function phpArray( arr ) {
	if ( arr.length === 0 ) return 'array()';
	return `array( '${ arr.join( "', '" ) }' )`;
}

// ---------------------------------------------------------------------------
// Config 1 — editor scripts + frontend CSS/JS (CommonJS/IIFE output)
// ---------------------------------------------------------------------------
const mainConfig = {
	name: 'main',
	entry: {
		'posts-grid':   './src/blocks/posts-grid/index.js',
		'posts-filter': './src/blocks/posts-filter/index.js',
		'pagination':   './src/blocks/pagination/index.js',
		'frontend':     './src/frontend/index.js',
	},
	output: {
		path: path.resolve( __dirname, 'build' ),
		filename: '[name].js',
		clean: true,
	},
	externals: {
		'@wordpress/blocks':       [ 'wp', 'blocks' ],
		'@wordpress/block-editor': [ 'wp', 'blockEditor' ],
		'@wordpress/components':   [ 'wp', 'components' ],
		'@wordpress/compose':      [ 'wp', 'compose' ],
		'@wordpress/data':         [ 'wp', 'data' ],
		'@wordpress/element':      [ 'wp', 'element' ],
		'@wordpress/i18n':         [ 'wp', 'i18n' ],
		'@wordpress/api-fetch':    [ 'wp', 'apiFetch' ],
		'@wordpress/core-data':    [ 'wp', 'coreData' ],
		'@wordpress/primitives':   [ 'wp', 'primitives' ],
		'@wordpress/url':          [ 'wp', 'url' ],
		react:                     'React',
		'react-dom':               'ReactDOM',
	},
	module: {
		rules: [
			{
				test: /\.(js|jsx)$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [
							'@babel/preset-env',
							[ '@babel/preset-react', { runtime: 'classic' } ],
						],
					},
				},
			},
			{
				test: /\.scss$/,
				use: [
					MiniCssExtractPlugin.loader,
					'css-loader',
					{
						loader: 'sass-loader',
						options: { api: 'modern' },
					},
				],
			},
			{
				test: /\.css$/,
				use: [ MiniCssExtractPlugin.loader, 'css-loader' ],
			},
		],
	},
	plugins: [
		new MiniCssExtractPlugin( {
			filename: '[name].css',
		} ),
		new WordPressAssetPlugin(),
		new CopyWebpackPlugin( {
			patterns: [
				{
					from: 'src/blocks/*/block.json',
					to( { absoluteFilename } ) {
						const blockSlug = path.basename( path.dirname( absoluteFilename ) );
						return `${ blockSlug }.block.json`;
					},
					transform( content, absoluteFrom ) {
						const json      = JSON.parse( content.toString() );
						const blockSlug = path.basename( path.dirname( absoluteFrom ) );

						json.editorScript = `file:./${ blockSlug }.js`;

						if ( json.editorStyle ) {
							json.editorStyle = `file:./${ blockSlug }.css`;
						}
						if ( json.style ) {
							json.style = 'file:./frontend.css';
						}
						if ( json.viewScriptModule ) {
							const vmFile = path.basename(
								json.viewScriptModule.replace( /^file:.*\//, '' )
							);
							json.viewScriptModule = `file:./${ vmFile }`;
						}

						return JSON.stringify( json, null, '\t' );
					},
				},
			],
		} ),
	],
	resolve: {
		extensions: [ '.js', '.jsx' ],
	},
	devtool: isProduction ? false : 'source-map',
};

// ---------------------------------------------------------------------------
// Config 2 — Interactivity API view script (ES module output)
//
// WordPress Script Modules API requires type="module" output.
// @wordpress/interactivity is externalized — WordPress provides it via
// an import map at runtime so the browser resolves it without bundling.
// ---------------------------------------------------------------------------
const moduleConfig = {
	name: 'interactivity',
	dependencies: [ 'main' ], // run after main so build/ is clean first
	entry: {
		[ INTERACTIVITY_MODULE_ENTRY ]: './src/interactivity/view.js',
	},
	output: {
		path: path.resolve( __dirname, 'build' ),
		filename: '[name].js',
		module: true,
		library: { type: 'module' },
		clean: false, // main config already cleaned
	},
	experiments: {
		outputModule: true,
	},
	externalsType: 'module',
	externals: {
		'@wordpress/interactivity': '@wordpress/interactivity',
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [ '@babel/preset-env' ],
					},
				},
			},
		],
	},
	resolve: {
		extensions: [ '.js' ],
	},
	devtool: isProduction ? false : 'source-map',
	mode: isProduction ? 'production' : 'development',
};

module.exports = [ mainConfig, moduleConfig ];
