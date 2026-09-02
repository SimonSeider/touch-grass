import net from 'node:net';

export function waitForPort(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConn = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeout) reject(new Error('timeout waiting for port ' + port));
        else setTimeout(tryConn, 200);
      });
    };
    tryConn();
  });
}
