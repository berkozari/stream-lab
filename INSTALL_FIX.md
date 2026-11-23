# STREAM-002.6 Installer Fix

Unzip over the existing installer from repository root:

```bash
unzip -o "$HOME/Downloads/StreamLab_STREAM-002.6_Installer_Fix.zip" -d .
node apply-stream-002-6.mjs
```

The package requires the existing `stream-002-6-payload/` folder from the original patch ZIP. It tolerates wrapped Creator JSX text and preserves customized descriptions.
