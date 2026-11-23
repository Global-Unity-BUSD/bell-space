const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The floor-plan SVGs (../maps) and the API types (../shared) live outside the
// app folder, so Metro must watch them too.
config.watchFolders = [path.resolve(__dirname, '../maps'), path.resolve(__dirname, '../shared')];
config.transformer.babelTransformerPath = require.resolve('./svg-transformer.cjs');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');

module.exports = config;
