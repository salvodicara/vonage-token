# vonage-token

Mint JWTs for your own Vonage applications from the command line, so you can get a
Vonage Client SDK session going without writing a backend first.

Testing a Client SDK means holding a signed JWT for an application you own, scoped to
a user that exists. That is two API concepts and a chunk of RS256 signing before you
can place a single call. This does both in two commands, keeps your private keys
outside the repo, and lets you keep several applications configured at once so you
can switch between environments.

> Unofficial, and not a Vonage product. It is a personal tool that signs tokens for
> applications **you** already own, using **your** private key on **your** machine.
> It is not supported by Vonage, and nothing here gives access to anything you could
> not already reach from the dashboard.

## Requirements

Node 20 or newer, and [just](https://just.systems). No dependencies, no build step.

You will also need, from the [Vonage dashboard](https://dashboard.nexmo.com/applications),
an application with Voice capability: its **application ID** and its **private key**
(the `private.key` file you downloaded when you created it).

## A Client SDK session in three commands

```bash
just add                  # name it, paste the application ID and private key
just users testuser1      # create the user the token will belong to
just token testuser1      # the JWT, printed and copied to your clipboard
```

Hand that token to `VonageClient.createSession()` in the Android, iOS, JavaScript or
Flutter SDK and you are connected.

## Commands

| Command | What it does |
| --- | --- |
| `just apps` | List your applications; `▶` marks the one tokens are minted for |
| `just switch [name]` | Choose which application to use; picker if you don't name one |
| `just add` | Add an application |
| `just rm [name]` | Remove one |
| `just config` | Open `apps.json` in your editor, then check it is still valid |
| `just check` | Check `apps.json` without opening it |
| `just set-key <name> <path>` | Point an application at a different private key |
| `just token [user]` | Mint a token for `user`, or an admin token if you name nobody |
| `just users [names…]` | Create these users if they don't exist (default `testuser1 testuser2`) |
| `just emergency-token <user> <from> <to>` | A user token that may also place emergency calls between two numbers |
| `just test` | Run the tests |

In a terminal, `just token` prints the token and copies it to your clipboard. Piped,
it prints the bare token and nothing else, so `TOKEN=$(just token testuser1)` works.

## Changing what the tokens contain

Everything configurable is in [`defaults.js`](defaults.js) — three constants:

- `TTL` — how long a token lasts, in seconds. 24 hours by default.
- `ACL` — the [permissions](https://developer.vonage.com/en/conversation/guides/jwt-acl)
  each token grants, as path patterns mapped to allowed methods. The defaults cover
  what the Client SDKs need for calling, messaging and connectivity reporting.
- `API_VERSION` — the Conversation API version `just users` talks to.

Edit a constant, run the command again. There is no other configuration.

## Where your credentials live

`~/.config/vonage-token/apps.json`, or `$XDG_CONFIG_HOME/vonage-token/apps.json` if
you set that. Never in this repo. It holds one entry per application:

```json
{
  "myApp": {
    "app_id": "00000000-0000-0000-0000-000000000000",
    "api": "https://api.nexmo.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
  }
}
```

`api` is the host with no version path — the version comes from `defaults.js`. The
file is yours to edit: `just config` opens it and checks it afterwards, and every
command tells you which application and which field is wrong if something is off.
The one edit that is awkward by hand is the private key, because JSON needs its
newlines escaped, so use `just set-key` for that.

It contains private keys, so it is written `0600` and worth backing up somewhere
safe. If you lose one, you can generate a fresh key for the application in the
dashboard and `just set-key` it.

## Working on it

No dependencies and no build step. Every file starts with `// @ts-check` and describes
its shapes in JSDoc, so VS Code, Cursor and Zed type-check the source through
`jsconfig.json` without TypeScript being installed. `just test` runs the suite on
`node --test`; each test drives the commands in a subprocess against a throwaway
config directory, so running them cannot touch your real credentials.
