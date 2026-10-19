// @ts-check

// Every test runs the CLI in a subprocess against a throwaway config directory,
// so nothing here can touch the real ~/.config/vonage-token.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TTL } from './defaults.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const SEED = {
  alpha: { app_id: 'a-1', api: 'https://api.example.com', private_key: PEM },
  beta: { app_id: 'b-2', api: 'https://api2.example.com', private_key: PEM },
};

/** @param {string} [active] @param {unknown} [apps] */
function makeConfig(active, apps = SEED) {
  const root = mkdtempSync(join(tmpdir(), 'vonage-token-test-'));
  const dir = join(root, 'vonage-token');
  mkdirSync(dir, { recursive: true });
  const appsPath = join(dir, 'apps.json');
  writeFileSync(appsPath, typeof apps === 'string' ? apps : JSON.stringify(apps, null, 2));
  if (active) writeFileSync(join(dir, 'active'), active);
  return {
    root,
    env: { ...process.env, XDG_CONFIG_HOME: root },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    readApps: () => JSON.parse(readFileSync(appsPath, 'utf8')),
    readActive: () => {
      const p = join(dir, 'active');
      return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
    },
  };
}

/**
 * @param {string | undefined} active
 * @param {(ctx: ReturnType<typeof makeConfig>) => void} fn
 * @param {unknown} [apps]
 */
const withConfig = (active, fn, apps) => () => {
  const ctx = makeConfig(active, apps);
  try {
    fn(ctx);
  } finally {
    ctx.cleanup();
  }
};

const run = (ctx, script, ...args) => spawnSync('node', [script, ...args], { env: ctx.env, encoding: 'utf8' });
const apps = (ctx, ...args) => run(ctx, 'apps.js', ...args);

/** @param {string} token */
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

// ---------- apps ----------

test('list marks the active app', withConfig('alpha', (ctx) => {
  const r = apps(ctx, 'list');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /▶ alpha/);
  assert.match(r.stdout, /^ {2}beta/m);
}));

test('switch sets the active app', withConfig('alpha', (ctx) => {
  assert.equal(apps(ctx, 'switch', 'beta').status, 0);
  assert.equal(ctx.readActive(), 'beta');
}));

test('switch to an unknown app fails and lists what exists', withConfig('alpha', (ctx) => {
  const r = apps(ctx, 'switch', 'nope');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown app: nope/);
  assert.match(r.stderr, /alpha, beta/);
}));

test('set-key reads a PEM from a path', withConfig('alpha', (ctx) => {
  const replacement = '-----BEGIN PRIVATE KEY-----\nREPLACED\n-----END PRIVATE KEY-----';
  const path = join(ctx.root, 'new.key');
  writeFileSync(path, replacement);
  assert.equal(apps(ctx, 'set-key', 'alpha', path).status, 0);
  assert.equal(ctx.readApps().alpha.private_key, replacement);
  assert.equal(ctx.readApps().beta.private_key, PEM, 'other apps untouched');
}));

test('set-key turns a one-line PEM back into a multi-line one', withConfig('alpha', (ctx) => {
  const path = join(ctx.root, 'oneline.key');
  writeFileSync(path, String.raw`-----BEGIN PRIVATE KEY-----\nONELINE\n-----END PRIVATE KEY-----`);
  assert.equal(apps(ctx, 'set-key', 'alpha', path).status, 0);
  assert.equal(ctx.readApps().alpha.private_key, '-----BEGIN PRIVATE KEY-----\nONELINE\n-----END PRIVATE KEY-----');
}));

test('set-key refuses something that is not a PEM', withConfig('alpha', (ctx) => {
  const path = join(ctx.root, 'bad.txt');
  writeFileSync(path, 'not a key');
  const r = apps(ctx, 'set-key', 'alpha', path);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /does not look like a PEM/);
}));

test('rm removes an app and clears active when it was the active one', withConfig('alpha', (ctx) => {
  assert.equal(apps(ctx, 'rm', 'alpha').status, 0);
  assert.deepEqual(Object.keys(ctx.readApps()), ['beta']);
  assert.equal(ctx.readActive(), null);
}));

// ---------- broken config ----------

test('a missing config says how to create one', () => {
  const root = mkdtempSync(join(tmpdir(), 'vonage-token-test-'));
  try {
    const r = spawnSync('node', ['token.js'], { env: { ...process.env, XDG_CONFIG_HOME: root }, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /No apps configured/);
    assert.match(r.stderr, /just add/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('no active app says how to choose one', withConfig(undefined, (ctx) => {
  const r = run(ctx, 'token.js');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No active app/);
  assert.match(r.stderr, /just switch/);
}));

test('malformed JSON is reported as such, not as a missing config', withConfig('alpha', (ctx) => {
  const r = run(ctx, 'token.js');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is not valid JSON/);
  assert.match(r.stderr, /just config/);
}, '{ "alpha": { oops }'));

test('check names the app and the fields that are missing', withConfig('alpha', (ctx) => {
  const r = apps(ctx, 'check');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /gamma is missing: api, private_key/);
}, { ...SEED, gamma: { app_id: 'c-3' } }));

// ---------- tokens ----------

test('an admin token is a verifiable RS256 JWT carrying the ACL', withConfig('alpha', (ctx) => {
  const r = run(ctx, 'token.js');
  assert.equal(r.status, 0, r.stderr);
  const token = r.stdout.trim();
  const [header, body, signature] = token.split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${header}.${body}`).verify(publicKey, signature, 'base64url'));

  const payload = claims(token);
  assert.equal(payload.application_id, 'a-1');
  assert.equal(payload.iss, 'alpha');
  assert.equal(payload.exp - payload.iat, TTL);
  assert.ok(payload.acl.paths['/*/users/*']);
  assert.equal(payload.sub, undefined, 'an admin token has no subject');
}));

test('naming a user puts them in the subject claim', withConfig('alpha', (ctx) => {
  assert.equal(claims(run(ctx, 'token.js', 'testuser1').stdout.trim()).sub, 'testuser1');
}));

test('piped output is the bare token and nothing else', withConfig('alpha', (ctx) => {
  const { stdout } = run(ctx, 'token.js', 'testuser1');
  assert.equal(stdout.trimEnd().split('\n').length, 1);
  assert.match(stdout.trim(), /^[\w-]+\.[\w-]+\.[\w-]+$/);
}));

test('an emergency token keeps the normal ACL and adds the number filters', withConfig('alpha', (ctx) => {
  const r = run(ctx, 'emergency.js', 'testuser1', '442079460000', '442079460001');
  assert.equal(r.status, 0, r.stderr);
  const payload = claims(r.stdout.trim());
  assert.equal(payload.sub, 'testuser1');
  assert.ok(payload.acl.paths['/*/rtc/**'], 'normal permissions still present');
  assert.deepEqual(payload.acl.paths['/v1/emergency/**'].filters, { from: '442079460000', to: '442079460001' });
}));

test('emergency without all three arguments explains the usage', withConfig('alpha', (ctx) => {
  const r = run(ctx, 'emergency.js', 'testuser1');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Usage: just emergency-token/);
}));

test('importing token.js does not run its command line', withConfig('alpha', (ctx) => {
  // `node -e` leaves process.argv[1] undefined, which the entrypoint check has to survive.
  const r = spawnSync('node', ['--input-type=module', '-e', 'await import("./token.js")'], { env: ctx.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'importing must not print a token');
}));

test('emergency prints one token, not one per module that signs', withConfig('alpha', (ctx) => {
  const r = run(ctx, 'emergency.js', 'testuser1', '442079460000', '442079460001');
  assert.equal(r.stdout.trimEnd().split('\n').length, 1);
}));
