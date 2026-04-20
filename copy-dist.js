const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

// Copy index.html
fs.copyFileSync(
  path.join(__dirname, 'index.html'),
  path.join(dist, 'index.html')
);

// Copy sprites folder if it exists
const spriteSrc = path.join(__dirname, 'sprites');
const spriteDst = path.join(dist, 'sprites');
if (fs.existsSync(spriteSrc)) {
  if (!fs.existsSync(spriteDst)) fs.mkdirSync(spriteDst);
  for (const f of fs.readdirSync(spriteSrc)) {
    fs.copyFileSync(path.join(spriteSrc, f), path.join(spriteDst, f));
  }
}

// Copy qr.png if it exists
const qrSrc = path.join(__dirname, 'qr.png');
if (fs.existsSync(qrSrc)) fs.copyFileSync(qrSrc, path.join(dist, 'qr.png'));

console.log('Copied frontend to dist/');
