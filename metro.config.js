// 네이티브 3D 지도 자료(assets/3d/campus.glb)를 앱 묶음 자산으로.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gguf');
module.exports = config;
