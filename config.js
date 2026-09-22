// @ts-check

// Resolves the active app. Importing this module is what guarantees the rest of
// the tool has a complete, usable set of credentials to work with.

import { API_VERSION } from './defaults.js';
import { loadApps, getActive, fail, APPS_PATH, REQUIRED_FIELDS } from './store.js';

const apps = loadApps();
if (!Object.keys(apps).length) fail(`No apps configured in ${APPS_PATH}`, 'just add');

const active = getActive();
if (!active) fail('No active app selected.', 'just switch');
if (!apps[active]) fail(`Active app "${active}" is not in apps.json.`, 'just switch');

const missing = REQUIRED_FIELDS.filter((field) => !apps[active][field]);
if (missing.length) fail(`App "${active}" is missing: ${missing.join(', ')}`, 'just config');

export const app = { name: active, ...apps[active] };
export const apiUrl = `${app.api}/${API_VERSION}`;
