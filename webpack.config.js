const path = require( 'path' );
const MiniCssExtractPlugin = require( 'mini-css-extract-plugin' );
const CopyWebpackPlugin = require( 'copy-webpack-plugin' );

const isProduction = process.env.NODE_ENV === 'production';

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
		// Copy each block.json to build/ so WordPress can discover blocks
		// from the build directory with local file: references.
		new CopyWebpackPlugin( {
			patterns: [
				{
					from: 'src/blocks/*/block.json',
					// Rename to <block-slug>.block.json so all three
					// coexist in build/ without overwriting each other.
					to( { absoluteFilename } ) {
						const blockSlug = path.basename(
							path.dirname( absoluteFilename )
						);
						return `${ blockSlug }.block.json`;
					},
					// Rewrite file: paths to local filenames in build/.
					transform( content, absoluteFrom ) {
						const json = JSON.parse( content.toString() );
						const blockSlug = path.basename(
							path.dirname( absoluteFrom )
						);

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
