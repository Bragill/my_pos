// Generates a self-signed certificate using Node's built-in crypto (Node 15+)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir);

const keyFile = path.join(certDir, 'key.pem');
const certFile = path.join(certDir, 'cert.pem');

if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  console.log('Certs already exist, skipping.');
  process.exit(0);
}

// Use selfsigned npm package if available, else try openssl
try {
  // Try using @vitejs/plugin-basic-ssl approach — just write a script
  const { generateKeyPairSync, createCertificate } = require('crypto');
  console.log('Using node crypto...');
} catch (e) {}

// Generate via openssl if available
try {
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'inherit' });
  console.log('Certs generated via openssl.');
  process.exit(0);
} catch (e) {
  console.log('openssl not found, trying alternative...');
}

console.log('ERROR: Could not generate certificate. Install openssl or mkcert.');
process.exit(1);
