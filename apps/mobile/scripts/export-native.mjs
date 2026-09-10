import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateExportEnvironment } from './export-environment.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApp = createRequire(path.join(appRoot, 'package.json'));
const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const platform = platformIndex < 0 ? 'all' : args[platformIndex + 1];
try {
  if (!['android', 'ios', 'web', 'all'].includes(platform)) throw new Error('Choose android, ios, web or all for the export platform.');
  validateExportEnvironment(process.env, { development: args.includes('--dev'), platform });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const cli = path.join(path.dirname(requireApp.resolve('expo/package.json')), 'bin/cli');
const child = spawnSync(process.execPath, [cli, 'export', ...args], {
  cwd: appRoot, stdio: 'inherit', env: { ...process.env, EXPO_NO_DOTENV: '1' },
});
if (child.error) console.error('The Expo export process could not start.');
process.exit(child.status ?? 1);
