// Startup file for Plesk (Passenger) or any host that needs a fixed entry point.
// Run `npm run build` first; this just starts the self-contained standalone server.
// The standalone server binds to $HOSTNAME, which is the machine name on many hosts
// and then refuses localhost/proxy traffic — bind to all interfaces unless told otherwise.
process.env.HOSTNAME = process.env.BIND_HOST || "0.0.0.0";
require("./.next/standalone/server.js");
