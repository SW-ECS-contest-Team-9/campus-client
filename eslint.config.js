// ESLint(flat) — Expo 기본 규칙 + Prettier 와 겹치는 모양 규칙 끔.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  { ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'src/ui/characterImages.ts', 'src/map/fixture/*'] },
]);
