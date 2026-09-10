const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { Buffer: 'readonly' } } },
  { ignores: ['dist/**', '.expo/**', 'android/**', 'ios/**'] },
]);
