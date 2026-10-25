// Regenerates words.js from words.txt. Only needed if words.txt changes.
// words.js lets the game load the word list from a <script> tag, which also
// works when index.html is opened straight from disk (fetch() doesn't).
// Run with: node tools/build-words.js
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const words = fs.readFileSync(path.join(root, 'words.txt'), 'utf8').trim().split(/\r?\n/).join('\n');
fs.writeFileSync(path.join(root, 'words.js'), `self.MAMMBLE_WORDS = ${JSON.stringify(words)};\n`);
console.log(`words.js written (${words.split('\n').length} words)`);
