// @ts-check

// Everything configurable lives here. Edit a constant, run the command again.

/** Conversation API version, appended to each app's `api` host. */
export const API_VERSION = 'v0.3';

/** How long a minted token stays valid, in seconds. */
export const TTL = 86400;

/**
 * Permissions granted by every token, as path patterns mapped to allowed methods.
 * An empty object allows all methods. Remove what you don't need.
 * Reference: https://developer.vonage.com/en/conversation/guides/jwt-acl
 */
export const ACL = {
  paths: {
    '/*/users/**': { methods: ['GET', 'POST'] },
    '/*/sessions/**': { methods: ['POST'] },
    '/*/conversations/*': { methods: ['GET'] },
    '/*/conversations/*/events*': { methods: ['POST', 'GET'] },
    '/*/conversations/*/legs': { methods: ['GET'] },
    '/*/conversations/*/rtc/*/answer': { methods: ['POST'] },
    '/*/conversations/*/rtc/*/offer/*': { methods: ['POST'] },
    '/*/conversations/*/members/*': { methods: ['PUT', 'DELETE'] },
    '/*/knocking/**': { methods: ['POST', 'DELETE'] },
    '/*/legs/**': { methods: ['POST', 'GET'] },
    '/*/rtc/**': { methods: ['POST', 'GET'] },
    '/*/devices/**': { methods: ['PUT', 'DELETE'] },
    '/*/discovery/**': { methods: ['GET'] },
    // Voice Insights sits at /voice-insights/v1/**, so it has no leading segment
    // for `/*/` to match — unlike every Conversation API path above.
    '/voice-insights/**': {},
  },
};

/**
 * Extra permissions added by `just emergency-token`, restricted to one number pair.
 * @param {string} from
 * @param {string} to
 */
export const emergencyAcl = (from, to) => ({
  paths: {
    ...ACL.paths,
    '/v1/emergency/**': { methods: ['PUT', 'POST', 'DELETE', 'GET', 'OPTIONS'], filters: { from, to } },
  },
});
