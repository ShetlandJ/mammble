# Mammble

A crossword-style word game played against the computer. No ads, no accounts, and it works offline once it has been opened.

Plain HTML, CSS and JavaScript with no build step.

## Playing it

- **On the web:** https://shetlandj.github.io/mammble/
- **Locally:** open `index.html` in a browser. Everything works from disk except offline install, which needs the page to be served over http(s). To serve it locally, run `python3 -m http.server` in this folder and go to http://localhost:8000.

## Putting it on an iPad

1. Open https://shetlandj.github.io/mammble/ in **Safari**. It has to be Safari: other browsers on iPad can't add web apps to the Home Screen.
2. Wait for the board to appear, so the game has been saved for offline use.
3. Tap the **Share** button (the square with an arrow pointing up), then **Add to Home Screen**, then **Add**.
4. Open it from the new **Mammble** icon. It runs full screen, works without internet, and remembers the game in progress.

On Android, open the link in Chrome and choose **Install app** (or **Add to Home screen**) from the ⋮ menu.

Updates are picked up automatically: the next time the game opens with an internet connection, it fetches the new version in the background and uses it from the following launch.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The page, its look, and the game screen (tapping, dragging, turns, saving) |
| `engine.js` | Rules, scoring, word checking and the computer's move finder. No DOM, so it can be tested in Node |
| `words.txt` | The ENABLE word list (public domain, 172,823 words) |
| `words.js` | `words.txt` wrapped in a script so it also loads when `index.html` is opened from disk. Rebuild with `node tools/build-words.js` |
| `manifest.webmanifest`, `sw.js`, `icons/` | What makes it installable and work offline. Icons are drawn by `tools/make-icons.py` |
| `tests/engine.test.js` | Tests for validation, scoring and move generation. Run with `node tests/engine.test.js` |

## How the computer plays

The word list is loaded into a compact trie (typed arrays, about 390k nodes). Moves are found with the Appel & Jacobson anchor-square algorithm: cross-checks limit which letters can go in each square, and words are extended left and right from each anchor, in both directions. A rack with two blanks takes well under a second.

- **Easy** picks at random from short, low-scoring words.
- **Medium** picks at random from words scoring 55–85% of the best available.
- **Hard** always plays the highest-scoring word.

## Rules notes

- Swapping needs at least 7 tiles in the bag.
- The game ends when the bag is empty and someone uses their last tile, or after six scoreless turns in a row (passes and swaps). Leftover tile values are deducted, and a player who goes out also gains the opponent's leftover total.
