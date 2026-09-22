// @ts-check

// The `just apps | switch | add | config | set-key | rm` commands.

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';
import {
  APPS_PATH, REQUIRED_FIELDS,
  loadApps, saveApps, getActive, setActive, clearActive,
  fail,
} from './store.js';

/** @typedef {import('./store.js').Apps} Apps */

// ---------- display ----------

/** @param {string} api */
const hostOf = (api) => {
  try {
    return new URL(api).host;
  } catch {
    return api;
  }
};

/**
 * One line per app, marking the active one.
 * @param {Apps} apps
 * @param {string} active
 */
const formatEntries = (apps, active) => {
  const names = Object.keys(apps);
  const width = Math.max(...names.map((n) => n.length), 0);
  return names.map((n) => `${n === active ? '▶ ' : '  '}${n.padEnd(width)}  ${hostOf(apps[n].api)}`);
};

// ---------- input ----------

/** @param {string} question @returns {Promise<string>} empty on Ctrl+D, which callers treat as cancel */
const ask = (question) => new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => { resolve(answer.trim()); rl.close(); });
  rl.once('close', () => resolve(''));
});

/** @param {string[]} labels @returns {Promise<number>} -1 if cancelled */
async function pick(labels) {
  labels.forEach((label, i) => console.log(`  ${i + 1}) ${label}`));
  const n = Number(await ask(`Pick [1-${labels.length}]: `));
  return Number.isInteger(n) && n >= 1 && n <= labels.length ? n - 1 : -1;
}

/** A PEM pasted into a JSON file arrives with literal backslash-n instead of newlines. */
const normalizePem = (s) => (!s.includes('\n') && s.includes('\\n') ? s.replace(/\\n/g, '\n') : s);

/** Read a PEM from `input`, which is either the key itself or a path to it. @param {string} input */
function resolvePem(input) {
  if (input.startsWith('-----')) return normalizePem(input);
  const path = input.startsWith('~') ? input.replace(/^~/, homedir()) : input;
  try {
    return normalizePem(readFileSync(path, 'utf8').trim());
  } catch (e) {
    return fail(`Cannot read ${path}: ${e instanceof Error ? e.message : e}`, 'pass the path to your application\'s private.key');
  }
}

/** @param {string} pem */
const requirePem = (pem) => {
  if (!pem.includes('BEGIN') || !pem.includes('PRIVATE KEY')) {
    fail('That does not look like a PEM private key.', 'download private.key from the Vonage dashboard and pass its path');
  }
  return pem;
};

/** The first line decides: a path, or the start of a pasted key. @returns {Promise<string>} */
function askPrivateKey() {
  process.stdout.write('Private key (path to private.key, or paste it): ');
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    /** @type {string[]} */
    const lines = [];
    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length === 1 && !line.startsWith('-----')) rl.close();
      else if (line.includes('-----END') && line.includes('PRIVATE KEY-----')) rl.close();
    });
    rl.on('close', () => resolve(resolvePem(lines.join('\n').trim())));
  });
}

// ---------- shared ----------

/** @param {Apps} apps */
const requireApps = (apps) => {
  if (!Object.keys(apps).length) fail('No apps configured.', 'just add');
};

/** @param {Apps} apps @param {string} name */
const requireApp = (apps, name) => {
  if (!apps[name]) fail(`Unknown app: ${name}`, `just apps  (have: ${Object.keys(apps).join(', ')})`);
};

/** Resolve an app name, prompting if it was not given. @param {Apps} apps @returns {Promise<string>} */
async function resolveName(apps, name) {
  if (name) {
    requireApp(apps, name);
    return name;
  }
  if (!process.stdin.isTTY) fail('No app name given.', `pass one of: ${Object.keys(apps).join(', ')}`);
  const index = await pick(formatEntries(apps, getActive()));
  if (index < 0) {
    console.log('Cancelled.');
    process.exit(0);
  }
  return Object.keys(apps)[index];
}

// ---------- commands ----------

function cmdList() {
  const apps = loadApps();
  requireApps(apps);
  formatEntries(apps, getActive()).forEach((line) => console.log(line));
}

async function cmdSwitch(name) {
  const apps = loadApps();
  requireApps(apps);
  const chosen = await resolveName(apps, name);
  setActive(chosen);
  console.log(`Switched to ${chosen} (${hostOf(apps[chosen].api)})`);
}

async function cmdAdd() {
  const apps = loadApps();

  const name = await ask('Name (yours, for `just switch`): ');
  if (!name) fail('A name is required.', 'just add');
  if (apps[name]) fail(`App "${name}" already exists.`, `just config  (or pick another name)`);

  const app_id = await ask('Application ID: ');
  if (!app_id) fail('An application ID is required.', 'copy it from the Vonage dashboard');

  const api = await ask('API host [https://api.nexmo.com]: ') || 'https://api.nexmo.com';

  apps[name] = { app_id, api, private_key: requirePem(await askPrivateKey()) };
  saveApps(apps);
  console.log(`\n✓ Added ${name}`);

  if (!getActive()) {
    setActive(name);
    console.log('✓ Set as active');
  } else if ((await ask('Switch to it now? (y/N): ')).toLowerCase() === 'y') {
    setActive(name);
    console.log(`✓ Switched to ${name}`);
  }
}

/** Replace one app's key without hand-editing JSON, which is the one edit a PEM makes awkward. */
async function cmdSetKey(name, pemPath) {
  const apps = loadApps();
  requireApps(apps);
  const chosen = await resolveName(apps, name);
  if (!pemPath) fail('No key given.', `just set-key ${chosen} ~/path/to/private.key`);
  apps[chosen].private_key = requirePem(resolvePem(pemPath));
  saveApps(apps);
  console.log(`✓ Replaced the private key for ${chosen}`);
}

async function cmdRemove(name) {
  const apps = loadApps();
  requireApps(apps);
  const chosen = await resolveName(apps, name);

  if (process.stdin.isTTY && (await ask(`Remove "${chosen}"? (y/N): `)).toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  const wasActive = getActive() === chosen;
  delete apps[chosen];
  saveApps(apps);
  console.log(`✓ Removed ${chosen}`);
  if (wasActive) {
    clearActive();
    console.log(`! ${chosen} was the active app. Run: just switch`);
  }
}

/** Open the store in an editor, then say whether what came back is usable. */
function cmdConfig() {
  if (!existsSync(APPS_PATH)) fail(`No config at ${APPS_PATH}`, 'just add');
  const editor = process.env.VISUAL || process.env.EDITOR;
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawnSync(editor || opener, [APPS_PATH], { stdio: 'inherit', shell: Boolean(editor) });
  cmdCheck();
}

function cmdCheck() {
  const apps = loadApps();
  let ok = true;
  for (const [name, app] of Object.entries(apps)) {
    const missing = REQUIRED_FIELDS.filter((field) => !app[field]);
    if (missing.length) {
      console.error(`✗ ${name} is missing: ${missing.join(', ')}`);
      ok = false;
    }
  }
  if (!ok) fail(`${APPS_PATH} is incomplete.`, 'just config');
  console.log(`✓ ${Object.keys(apps).length} app(s) in ${APPS_PATH}`);
}

// ---------- dispatch ----------

const [, , command, ...args] = process.argv;
switch (command) {
  case 'list': cmdList(); break;
  case 'switch': await cmdSwitch(args[0]); break;
  case 'add': await cmdAdd(); break;
  case 'set-key': await cmdSetKey(args[0], args[1]); break;
  case 'rm': await cmdRemove(args[0]); break;
  case 'config': cmdConfig(); break;
  case 'check': cmdCheck(); break;
  default:
    fail(`Unknown command: ${command}`, 'just --list');
}
