// @ts-check

import { emergencyAcl } from './defaults.js';
import { signJwt, basePayload, printToken } from './token.js';

const [sub, from, to] = process.argv.slice(2);
if (!sub || !from || !to) {
  console.error('Usage: just emergency-token <user> <from-number> <to-number>');
  process.exit(1);
}

const token = signJwt({ ...basePayload(), sub, acl: emergencyAcl(from, to) });
printToken(token, `Emergency token for ${sub} (from=${from}, to=${to}):`);
