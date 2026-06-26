const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MergeIntoSingleFilePlugin = require('webpack-merge-and-include-globally');
const fs = require('fs');

const paths = require('./webpack._paths')

const isDevelopment = process.env.NODE_ENV !== 'production';

const htmlBodyContent = fs.readFileSync(paths.src + '/html/content.html').toString();

const htmlHeader = isDevelopment ? "<script src='http://localhost:35729/livereload.js'></script>" : "";

const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

const WatchExternalFilesPlugin = require('webpack-watch-files-plugin').default;
// const LiveReloadPlugin = require('webpack-livereload-plugin');
const WebpackFileWatcherLiveReload = require('./webpack._livereload.js');

const scssFiles = fs.readdirSync("./src").filter(function (file) {
    return file.match(/.*\.scss$/);
});
const scssEntries = scssFiles.map((filename) => {
    const filenameWithoutExtension = filename.replace(/\.[^/.]+$/, "");
    const entryName = `style_` + filenameWithoutExtension;
    return { [entryName]: "./src/" + filename };
});

//load package.json
const config = require('./package');

module.exports = {
  // Where webpack looks to start building the bundle
  entry: {
    index: [
        paths.src + '/_index.js',
        // paths.src + '/sass/custom.scss',
    ],
    // ...Object.assign({}, ...scssEntries),
    // indexCss: {
    //     import: paths.src + '/sass/custom.scss',
    //     filename: 'widget.css',
    // },
  },

  watchOptions: {
    poll: 1000,
    aggregateTimeout: 200,
    ignored: /node_modules/
  },

  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
  
  // Where webpack outputs the assets and bundles
  output: {
    path: paths.build,
    filename: '[name].js',
    publicPath: paths.build,
  },

  // Customize the webpack build process
  plugins: [
    // Removes/cleans build folders and unused assets when rebuilding
    new CleanWebpackPlugin(),

    // Copies files from target to destination folder
    new CopyWebpackPlugin({
      patterns: [
        {
          from: paths.public,
          to: paths.build,
          globOptions: {
            ignore: ['*.DS_Store'],
          },
          noErrorOnMissing: true,
        },
        {
          from: 'node_modules/@fortawesome/fontawesome-free/webfonts',
          to: paths.build + '/webfonts',
          globOptions: {
            ignore: ['*.DS_Store'],
          },
          noErrorOnMissing: true,
        },
        {
          from: 'node_modules/@fontsource/wire-one/files',
          to: paths.build + '/webfonts',
          globOptions: {
            ignore: ['*.DS_Store'],
          },
          noErrorOnMissing: true,
        },
        {
          from: 'node_modules/@fontsource/alumni-sans-pinstripe/files',
          to: paths.build + '/webfonts',
          globOptions: {
            ignore: ['*.DS_Store'],
          },
          noErrorOnMissing: true,
        },
        {
          from: 'node_modules/mermaid/dist/mermaid.min.js',
          to: paths.build + '/mermaid.min.js',
          noErrorOnMissing: true,
        },
      ],
    }),

    // Generates an HTML file from a template
    // Generates deprecation warning: https://github.com/jantimon/html-webpack-plugin/issues/1501
    new HtmlWebpackPlugin({
      title: config.title,
      description: config.description,
      template: paths.src + '/html/_index.html', // template file
      filename: 'index.html', // output file
      body: htmlBodyContent,
      header: htmlHeader,
      inject: false, //dont inject anything
    }),

    //TODO: update this to include only the vendor files that are needed for the widget
    new MergeIntoSingleFilePlugin({
        files: {
            //create one file for all vendor js
            "vendor.js": [
                'node_modules/jquery/dist/jquery.min.js',
                'node_modules/@popperjs/core/dist/umd/popper.js',
                'node_modules/bootstrap/dist/js/bootstrap.js',
                'node_modules/d3/dist/d3.js',
            ],
            //create one file for all vendor css
            "vendor.css": [
                'node_modules/bootstrap/dist/css/bootstrap.css',
                'node_modules/@fortawesome/fontawesome-free/css/all.min.css'
            ],
            //create one file for all widget js (explicit order — globs can miss files on dev rebuild)
            "widget.js": [
                paths.src + '/js/_namespace.js',
                paths.src + '/js/#events.js',
                paths.src + '/js/connection.js',
                paths.src + '/js/shell.js',
                paths.src + '/js/theme.js',
                paths.src + '/js/viz.core.js',
                paths.src + '/js/viz.force.js',
                paths.src + '/js/graph-shadows.js',
                paths.src + '/js/map.js',
                paths.src + '/js/subscriptions.js',
                paths.src + '/js/tests.js',
                paths.src + '/js/data-viewer.js',
                paths.src + '/js/data-viewer-host.js',
                paths.src + '/js/markdown.js',
                paths.src + '/js/profiling.js',
                paths.src + '/js/app.js',
            ],
            "widget.css": [
                paths.src + '/css/**/*.css',
            ]
        }
    }),

    // // Extracts CSS into separate files
    // new MiniCssExtractPlugin({
    //     filename: 'widget2.css'
    // }),

    // Watch for changes in files and reload the page
    isDevelopment && new WatchExternalFilesPlugin({
        files: [
          './src/**/*',
          '!./src/*.test.js'
        ]
    }),

    // auto reload the page using http://localhost:35729/livereload.js
    // new LiveReloadPlugin({}),
    isDevelopment && new WebpackFileWatcherLiveReload({
        watchFiles: [
            './src/**/*',
            '!./src/*.test.js'
          ]
      })
  ],

  // Determine how modules within the project are treated
  module: {
    rules: [
      // JavaScript: Just load JavaScript files as is
      //   { test: /\.js$/, use: ['babel-loader'] },
      { test: /\.js$/, 
        use: [
            {
                loader: 'raw-loader',
                options: {
                    esModule: false,
                },
            },
        ],
      },

      // Images: Copy image files to build folder
      { test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: 'asset/resource' },

      // Fonts and SVGs: Inline files
      { test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: 'asset/inline' },

    //   {
    //     test: /\.(sass|scss|css)$/,
    //     include: paths.src,
    //     // exclude: /node_modules/,
    //     // type: "asset/resource",
    //     // generator: {
    //     //   filename: "bundle.css",
    //     // },
    //     use: [
    //       MiniCssExtractPlugin.loader,
    //       {
    //         loader: 'css-loader',
    //         options: { sourceMap: false, importLoaders: 2, modules: false}, 
    //       },
    //       { loader: 'postcss-loader', options: { sourceMap: false } },
    //       { loader: 'sass-loader', 
    //         options: { 
    //             sourceMap: false,
    //         } 
    //       },
    //     ],
    //   },

    ],
  },

  optimization: {
    minimize: false, //TODO: change to minify only widget css and js but not vendor.
    minimizer: [new CssMinimizerPlugin({
        exclude: /vendor/,
        minimizerOptions: {
          preset: [
            "default",
            {
              discardComments: { removeAll: true },
            },
          ],
        },
      }),
    , '...'],
    runtimeChunk: {
      name: 'runtime',
    },
  },

  resolve: {
    modules: [paths.src, 'node_modules'],
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@': paths.src,
      assets: paths.public,
    },
  },

  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
}