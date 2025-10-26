const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './background/background.js',
    content: './content/content.js',
    popup: './popup/popup.js',
    offscreen: './offscreen/offscreen.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: (pathData) => {
      // Special handling for offscreen to put it in offscreen/offscreen.js
      if (pathData.chunk.name === 'offscreen') {
        return 'offscreen/offscreen.js';
      }
      return '[name]/[name].js';
    },
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup/popup.html', to: 'popup/popup.html' },
        { from: 'popup/popup.css', to: 'popup/popup.css' },
        { from: 'offscreen/offscreen.html', to: 'offscreen/offscreen.html' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true }
      ]
    })
  ],
  resolve: {
    extensions: ['.js'],
    modules: [path.resolve(__dirname, 'node_modules')]
  }
};
