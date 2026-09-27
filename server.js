// Startup file for Plesk (Passenger) or any host that needs a fixed entry point
// at the project root instead of .next/standalone/server.js directly (both work
// identically — see scripts/postbuild-standalone.mjs, which generates the real
// logic into .next/standalone/server.js on every build).
// Run `npm run build` first.
require("./.next/standalone/server.js");
