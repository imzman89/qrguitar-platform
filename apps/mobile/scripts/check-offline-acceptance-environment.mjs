import { validateExportEnvironment } from './export-environment.mjs';

validateExportEnvironment(process.env, {
  platform: 'android',
  offlineAcceptance: true,
});
console.log('Exact offline Android acceptance environment confirmed.');
