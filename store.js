// @ts-check

// Reading and writing the credential store. Nothing here talks to Vonage.

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** @typedef {{ app_id: string, api: string, private_key: string }} App */
/** @typedef {Record<string, App>} Apps */

const DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'vonage-token');
export const APPS_PATH = join(DIR, 'apps.json');
const ACTIVE_PATH = join(DIR, 'active');

export const REQUIRED_FIELDS = /** @type {const} */ (['app_id', 'api', 'private_key']);

/**
 * Print what is wrong and how to fix it, then stop.
 * @param {string} problem
 * @param {string} fix
 * @returns {never}
 */
export function fail(problem, fix) {
  console.error(problem);
  console.error(`Fix: ${fix}`);
  process.exit(1);
}

/** @returns {Apps} empty if the store does not exist yet */
export function loadApps() {
  let raw;
  try {
    raw = readFileSync(APPS_PATH, 'utf8');
  } catch {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fail(`${APPS_PATH} is not valid JSON: ${e instanceof Error ? e.message : e}`, 'just config');
  }
}

/** @param {Apps} apps */
export function saveApps(apps) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(APPS_PATH, JSON.stringify(apps, null, 2) + '\n', { mode: 0o600 });
}

export function getActive() {
  try {
    return readFileSync(ACTIVE_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

/** @param {string} name */
export function setActive(name) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ACTIVE_PATH, name + '\n');
}

export function clearActive() {
  try {
    unlinkSync(ACTIVE_PATH);
  } catch {}
}
