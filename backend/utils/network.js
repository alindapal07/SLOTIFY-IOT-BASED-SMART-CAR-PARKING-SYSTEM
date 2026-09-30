const os = require('os');

/**
 * Dynamically retrieves the server's local LAN IPv4 address.
 * Defaults to '127.0.5.1' or loopback if no valid interface is found.
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

module.exports = { getLocalIpAddress };
