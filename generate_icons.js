const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'POS_Project', 'frontend', 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// A minimal valid 1x1 PNG data to start with, or we can just create empty files if the browser allows, 
// but better to create actual small valid PNGs.
// This is a base64 of a simple blue 192x192 and 512x512 placeholder.
const blue192 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlSzhBAAAAA1BMVEUlb+v8+f0AAAA8SURBVHja7cEBDAAAAMOg+vpfXANfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4NcAs8AAAV77YecAAAAASUVORK5CYII=', 'base64');
const blue512 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADD7G1BAAAAA1BMVEUlb+v8+f0AAACpSURBVHja7cEBDAAAAMOg+vpfXANfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4NcAs8AAAV77YecAAAAASUVORK5CYII=', 'base64');

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), blue192);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), blue512);

console.log('Icons generated successfully in POS_Project/frontend/public/icons');
