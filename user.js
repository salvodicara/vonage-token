// @ts-check

import { app, apiUrl } from './config.js';
import { generateToken } from './token.js';

const DEFAULT_USERS = ['testuser1', 'testuser2'];
const names = process.argv.slice(2);
const users = names.length ? names : DEFAULT_USERS;

const headers = { Authorization: `Bearer ${generateToken()}`, 'Content-Type': 'application/json' };

/**
 * @param {string} name
 * @returns {Promise<{ name: string, id?: string, status: 'exists' | 'created' | 'error', error?: string }>}
 */
async function getOrCreateUser(name) {
  const getRes = await fetch(`${apiUrl}/users?name=${encodeURIComponent(name)}`, { headers });
  if (getRes.ok) {
    const data = /** @type {{ _embedded?: { users?: { name: string, id: string }[] } }} */ (await getRes.json());
    const found = data._embedded?.users?.[0];
    if (found) return { name: found.name, id: found.id, status: 'exists' };
  } else if (getRes.status !== 404) {
    return { name, status: 'error', error: `GET ${getRes.status}` };
  }
  const postRes = await fetch(`${apiUrl}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, display_name: name }),
  });
  if (postRes.ok) {
    const data = /** @type {{ name: string, id: string }} */ (await postRes.json());
    return { name: data.name, id: data.id, status: 'created' };
  }
  return { name, status: 'error', error: `POST ${postRes.status}` };
}

console.log(`App: ${app.name} → ${apiUrl}\n`);

const results = await Promise.all(users.map(getOrCreateUser));
for (const r of results) {
  const icon = r.status === 'created' ? '✓' : r.status === 'exists' ? '•' : '✗';
  console.log(`  ${icon} ${r.name} [${r.status}] ${r.error || r.id || ''}`);
}

if (results.some((r) => r.status === 'error')) process.exit(1);
