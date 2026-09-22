# Show every command (also what you get by running `just` on its own)
help:
    @just --list

# List your apps; ▶ marks the one tokens are minted for
apps:
    @node apps.js list

# Choose which app to mint tokens for (picker if you don't name one)
switch name="":
    @node apps.js switch {{name}}

# Add an app: asks for a name, application ID, API host and private key
add:
    @node apps.js add

# Open apps.json in your editor, then check it is still valid
config:
    @node apps.js config

# Check apps.json without opening it
check:
    @node apps.js check

# Point an app at a different private key
set-key name pem:
    @node apps.js set-key {{name}} {{pem}}

# Remove an app (asks first)
rm name="":
    @node apps.js rm {{name}}

# Mint a token: for a user if you name one, otherwise an admin token
token user="":
    @node token.js {{user}}

# Mint a user token that may also place emergency calls between two numbers
emergency-token user from to:
    @node emergency.js {{user}} {{from}} {{to}}

# Create these users on the active app if they don't exist yet
users *names="":
    @node user.js {{names}}

# Run the tests
test:
    @node --test test.js
