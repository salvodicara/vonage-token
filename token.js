// @ts-check

import { createSign, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import { app } from './config.js';
import { ACL, TTL } from './defaults.js';

/** @param {string | Uint8Array} data */
const base64url = (data) => Buffer.from(data).toString('base64url');

/**
 * Sign a payload with the active app's private key.
 * @param {Record<string, unknown>} payload
 */
export function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${body}`)
    .sign(app.private_key, 'base64url');
  return `${header}.${body}.${signature}`;
}

/** Claims shared by every token. `iat`/`nbf` are backdated to tolerate clock skew. */
export function basePayload() {
  const now = Math.floor(Date.now() / 1000) - 30;
  return {
    iss: app.name,
    iat: now,
    nbf: now,
    exp: now + TTL,
    jti: randomUUID(),
    application_id: app.app_id,
  };
}

/** @param {string} [username] omit for an admin token */
export function generateToken(username) {
  /** @type {Record<string, unknown>} */
  const payload = { ...basePayload(), acl: ACL };
  if (username) payload.sub = username;
  return signJwt(payload);
}

/** Try each platform's clipboard tool; do nothing if the machine has none. */
function copyToClipboard(text) {
  for (const cmd of ['pbcopy', 'wl-copy', 'xclip -selection clipboard', 'clip.exe']) {
    try {
      execSync(cmd, { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } catch {}
  }
  return false;
}

/**
 * The token goes to stdout so it can be piped or captured; everything a human
 * reads goes to stderr. Piped output is the bare token and nothing else.
 * @param {string} token
 * @param {string} label
 */
export function printToken(token, label) {
  if (process.stdout.isTTY) {
    console.error(label);
    console.log(token);
    if (copyToClipboard(token)) console.error('✓ copied to clipboard');
  } else {
    console.log(token);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const username = process.argv[2];
  printToken(generateToken(username), username ? `Token for ${username}:` : 'Admin token:');
}
