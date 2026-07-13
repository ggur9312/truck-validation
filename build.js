var fs = require('fs');
var path = require('path');

var srcPath = path.join(__dirname, 'src', 'bookmarklet.js');
var distDir = path.join(__dirname, 'dist');
var distPath = path.join(distDir, 'bookmarklet.txt');

var src = fs.readFileSync(srcPath, 'utf8');
var oneLine = src.replace(/\s*\n\s*/g, ' ').trim();

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
fs.writeFileSync(distPath, oneLine);

console.log('Built ' + distPath + ' (' + oneLine.length + ' chars)');
