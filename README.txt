StreamLab STREAM-002.3 Login patch installation script fix

1. In your stream-lab repository root, ensure original STREAM-002.3 ZIP was already extracted, so stream-002-3-payload/ exists.
2. Back up the original installer:
   cp apply-stream-002-3.mjs apply-stream-002-3.mjs.bak
3. Extract this ZIP into repository root, overwriting only apply-stream-002-3.mjs:
   unzip -o "$HOME/Downloads/StreamLab_STREAM-002.3_Installer_Fix.zip" -d .
4. Execute:
   node apply-stream-002-3.mjs
5. Then run your standard pnpm install, format, verify, tests and smoke checks.

This file only changes the installer matching of OpenAPI login description, not the application logic.
