// Deploy-time configuration, read by the assembly at boot as
// window.__ENV__. This copy is the dev default — Vite serves it at
// /env.js and copies it into the bundle. At deploy time the assets
// init container overwrites it in the served volume from the
// environment (see the containerization vertical): one bundle,
// every environment, no rebuild.
window.__ENV__ = { API_BASE_URL: '/api' };
