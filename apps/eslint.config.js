const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { files: ['**/*.cjs'], languageOptions: { globals: { __dirname: 'readonly', __filename: 'readonly' } } },
  { ignores: ['dist/**'] },
]);
