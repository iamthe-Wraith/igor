const { resolve } = require('path');
const { BannerPlugin } = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'none',
  output: {
    path: resolve(__dirname, '..', 'bin'),
    filename: 'igor'
  },
  target: 'node',
  entry: ['@babel/polyfill', './src/index.js'],
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      }
    ]
  },
  plugins: [
    new BannerPlugin({
      banner: '#!/usr/bin/env node\n',
      raw: true
    })
  ]
};
