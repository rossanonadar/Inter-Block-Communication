const path = require( 'path' );
const MiniCssExtractPlugin = require( 'mini-css-extract-plugin' );
const CopyWebpackPlugin = require( 'copy-webpack-plugin' );

const isProduction = process.env.NODE_ENV === 'production';

// WordPress script handles that map to our externals.
// These become the `dependencies` array inside each .asset.php file,
// telling WordPress which scripts to load before ours.
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

module.exports = {
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

		// Emit .asset.php files that WordPress needs to resolve dependencies.
		new WordPressAssetPlugin(),

		// Copy each block.json into build/ with corrected file: paths.
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
