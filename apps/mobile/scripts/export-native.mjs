import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateExportEnvironment } from './export-environment.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApp = createRequire(path.join(appRoot, 'package.json'));
const args = process.argv.slice(2);
const offlineAcceptance = args.includes('--offline-acceptance');
const expoArgs = args.filter(argument => argument !== '--offline-acceptance');
if (!expoArgs.some(argument => argument === '--clear' || argument === '-c')) expoArgs.push('--clear');
const platformIndex = args.indexOf('--platform');
const platform = platformIndex < 0 ? 'all' : args[platformIndex + 1];
try {
  if (!['android', 'ios', 'web', 'all'].includes(platform)) throw new Error('Choose android, ios, web or all for the export platform.');
  if (args.filter(argument => argument === '--offline-acceptance').length > 1) throw new Error('Offline acceptance mode may be selected only once.');
  validateExportEnvironment(process.env, { development: args.includes('--dev'), platform, offlineAcceptance });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const cli = path.join(path.dirname(requireApp.resolve('expo/package.json')), 'bin/cli');
const child = spawnSync(process.execPath, [cli, 'export', ...expoArgs], {
  cwd: appRoot, stdio: 'inherit', env: { ...process.env, EXPO_NO_DOTENV: '1' },
});
if (child.error) console.error('The Expo export process could not start.');
process.exit(child.status ?? 1);
