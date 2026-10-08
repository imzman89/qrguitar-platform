'use strict';
// Narrow replacement for Next15.5.25 ESLint's directory-pattern helper only.
const path = require('node:path');
const assert = require('node:assert/strict');
const tiny = require('tinyglobby');
const adapter = { globSync(pattern, options) {
  assert.equal(typeof pattern, 'string'); assert.deepEqual(options, { onlyDirectories: true });
  return tiny.globSync(pattern, { onlyDirectories: true, expandDirectories: false, absolute: path.isAbsolute(pattern) })
    .map(entry => { const normalized = entry.replaceAll('\\', '/'); return pattern.endsWith('/') ? normalized : normalized.replace(/\/$/, ''); });
} };
module.exports = adapter;
