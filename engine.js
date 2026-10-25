// Mammble game engine: dictionary, rules, scoring and move generation.
// Pure logic with no DOM access, so it runs in the browser and in Node tests.
(function (root) {
  'use strict';

  const SIZE = 15;
  const CENTER = 7 * SIZE + 7;
  const ALL_LETTERS = (1 << 26) - 1;
  const BLANK = 26;

  const VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, '?': 0,
  };

  const DISTRIBUTION = {
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
    N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, '?': 2,
  };

  // Bonus squares for the top-left quadrant; mirrored to the other three.
  const QUADRANT = {
    TW: [[0, 0], [0, 7], [7, 0]],
    DW: [[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]],
    TL: [[1, 5], [5, 1], [5, 5]],
    DL: [[0, 3], [3, 0], [2, 6], [6, 2], [3, 7], [7, 3], [6, 6]],
  };

  const PREMIUM = (function () {
    const grid = new Array(SIZE * SIZE).fill('');
    for (const type of Object.keys(QUADRANT)) {
      for (const [r, c] of QUADRANT[type]) {
        for (const [rr, cc] of [[r, c], [r, 14 - c], [14 - r, c], [14 - r, 14 - c]]) {
          grid[rr * SIZE + cc] = type;
        }
      }
    }
    return grid;
  })();

  const code = (ch) => ch.charCodeAt(0) - 65;
  const chr = (n) => String.fromCharCode(65 + n);

  // ---------- Dictionary (compact trie in typed arrays) ----------

  function Dictionary(text) {
    const words = text.split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length <= SIZE)
      .sort();

    let cap = 1 << 19;
    let first = new Int32Array(cap).fill(-1);
    let next = new Int32Array(cap).fill(-1);
    let last = new Int32Array(cap).fill(-1);
    let letter = new Uint8Array(cap);
    let term = new Uint8Array(cap);
    let count = 1;

    const grow = () => {
      const n = cap * 2;
      const g32 = (a) => { const b = new Int32Array(n).fill(-1); b.set(a); return b; };
      const g8 = (a) => { const b = new Uint8Array(n); b.set(a); return b; };
      first = g32(first); next = g32(next); last = g32(last);
      letter = g8(letter); term = g8(term);
      cap = n;
    };

    // Words are sorted, so new children are always appended as the last sibling.
    const path = [0];
    let prev = '';
    for (const w of words) {
      let k = 0;
      while (k < prev.length && k < w.length && prev[k] === w[k]) k++;
      path.length = k + 1;
      for (let i = k; i < w.length; i++) {
        if (count >= cap) grow();
        const n = count++;
        const p = path[i];
        letter[n] = code(w[i]);
        if (first[p] === -1) first[p] = n; else next[last[p]] = n;
        last[p] = n;
        path.push(n);
      }
      term[path[w.length]] = 1;
      prev = w;
    }

    this.first = first;
    this.next = next;
    this.letter = letter;
    this.term = term;
    this.size = words.length;
  }

  Dictionary.prototype.child = function (node, c) {
    for (let x = this.first[node]; x !== -1; x = this.next[x]) {
      const l = this.letter[x];
      if (l === c) return x;
      if (l > c) return -1;
    }
    return -1;
  };

  // Walk the trie along a string of letters; -1 if the path doesn't exist.
  Dictionary.prototype.walk = function (node, str) {
    for (let i = 0; i < str.length && node !== -1; i++) node = this.child(node, code(str[i]));
    return node;
  };

  Dictionary.prototype.has = function (word) {
    const n = this.walk(0, word.toUpperCase());
    return n !== -1 && this.term[n] === 1;
  };

  // ---------- Tiles ----------

  function newBag(random = Math.random) {
    const bag = [];
    for (const l of Object.keys(DISTRIBUTION)) {
      for (let i = 0; i < DISTRIBUTION[l]; i++) bag.push(l);
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  const tileValue = (t) => (t.b ? 0 : VALUES[t.l]);
  const rackValue = (letters) => letters.reduce((s, l) => s + VALUES[l], 0);

  // ---------- Words formed by a placement ----------

  // board: array of 225 cells, each null or { l: 'A', b: isBlank }
  // placed: [{ r, c, l, b }]
  function wordsFormed(board, placed, horizontal) {
    const fresh = new Map(placed.map((p) => [p.r * SIZE + p.c, p]));
    const at = (r, c) => {
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
      const i = r * SIZE + c;
      return fresh.get(i) || board[i];
    };

    const wordAt = (r, c, dr, dc) => {
      while (at(r - dr, c - dc)) { r -= dr; c -= dc; }
      const cells = [];
      while (at(r, c)) {
        const i = r * SIZE + c;
        cells.push({ r, c, tile: at(r, c), fresh: fresh.has(i) });
        r += dr; c += dc;
      }
      return cells;
    };

    const words = [];
    const p0 = placed[0];
    if (placed.length === 1) {
      words.push(wordAt(p0.r, p0.c, 0, 1), wordAt(p0.r, p0.c, 1, 0));
    } else {
      const [dr, dc] = horizontal ? [0, 1] : [1, 0];
      words.push(wordAt(p0.r, p0.c, dr, dc));
      for (const p of placed) words.push(wordAt(p.r, p.c, dc, dr));
    }
    return words.filter((w) => w.length >= 2);
  }

  function scoreWord(cells) {
    let sum = 0;
    let mult = 1;
    for (const { r, c, tile, fresh } of cells) {
      let v = tileValue(tile);
      if (fresh) {
        const p = PREMIUM[r * SIZE + c];
        if (p === 'DL') v *= 2;
        else if (p === 'TL') v *= 3;
        else if (p === 'DW') mult *= 2;
        else if (p === 'TW') mult *= 3;
      }
      sum += v;
    }
    return sum * mult;
  }

  function scorePlacement(board, placed, horizontal) {
    const words = wordsFormed(board, placed, horizontal).map((cells) => ({
      word: cells.map((x) => x.tile.l).join(''),
      score: scoreWord(cells),
      cells: cells.map(({ r, c }) => [r, c]),
    }));
    const bingo = placed.length === 7;
    const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? 50 : 0);
    return { words, score, bingo };
  }

  const isEmptyBoard = (board) => board.every((x) => !x);

  function listWords(words) {
    if (words.length === 1) return words[0];
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }

  // Check a player's placement. Returns { ok, error?, words, score, bingo }.
  function validateMove(board, placed, dict) {
    if (!placed.length) return { ok: false, error: 'Put some tiles on the board to make a word.' };

    const rows = new Set(placed.map((p) => p.r));
    const cols = new Set(placed.map((p) => p.c));
    if (rows.size > 1 && cols.size > 1) {
      return { ok: false, error: 'Your tiles need to be in one straight line, across or down.' };
    }
    const horizontal = rows.size === 1;

    const fresh = new Set(placed.map((p) => p.r * SIZE + p.c));
    for (const i of fresh) {
      if (board[i]) return { ok: false, error: 'That square already has a tile on it.' };
    }

    // No gaps between the first and last new tile.
    const line = placed.map((p) => (horizontal ? p.c : p.r));
    const fixed = horizontal ? placed[0].r : placed[0].c;
    for (let k = Math.min(...line); k <= Math.max(...line); k++) {
      const i = horizontal ? fixed * SIZE + k : k * SIZE + fixed;
      if (!fresh.has(i) && !board[i]) {
        return { ok: false, error: 'There is a gap in your word. The letters need to touch.' };
      }
    }

    if (isEmptyBoard(board)) {
      if (!fresh.has(CENTER)) return { ok: false, error: 'The first word must go over the star in the middle.' };
      if (placed.length < 2) return { ok: false, error: 'The first word needs at least two letters.' };
    } else {
      const touches = placed.some(({ r, c }) =>
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) =>
          rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && board[rr * SIZE + cc]));
      if (!touches) return { ok: false, error: 'Your word needs to join onto a word already on the board.' };
    }

    const result = scorePlacement(board, placed, horizontal);
    if (!result.words.length) return { ok: false, error: 'Your word needs at least two letters.' };

    const bad = result.words.map((w) => w.word).filter((w) => !dict.has(w));
    if (bad.length) {
      const unique = [...new Set(bad)];
      const verb = unique.length === 1 ? "isn't" : "aren't";
      return { ok: false, error: `${listWords(unique)} ${verb} in the dictionary.`, invalid: unique, ...result };
    }
    return { ok: true, ...result };
  }

  // ---------- Move generation (Appel & Jacobson anchor method) ----------

  function transpose(board) {
    const t = new Array(SIZE * SIZE);
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) t[c * SIZE + r] = board[r * SIZE + c];
    return t;
  }

  // Generate across moves on `board`; callback receives placements in board coordinates.
  function generateAcross(board, counts, dict, emit) {
    const filled = (r, c) => c >= 0 && c < SIZE && !!board[r * SIZE + c];
    const empty = isEmptyBoard(board);

    // Which letters may go in each empty square, given the tiles above and below it.
    const cross = new Int32Array(SIZE * SIZE);
    const anchor = new Uint8Array(SIZE * SIZE);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const i = r * SIZE + c;
        if (board[i]) continue;
        let above = '';
        for (let k = r - 1; k >= 0 && board[k * SIZE + c]; k--) above = board[k * SIZE + c].l + above;
        let below = '';
        for (let k = r + 1; k < SIZE && board[k * SIZE + c]; k++) below += board[k * SIZE + c].l;
        if (!above && !below) {
          cross[i] = ALL_LETTERS;
        } else {
          let mask = 0;
          const base = dict.walk(0, above);
          if (base !== -1) {
            for (let x = dict.first[base]; x !== -1; x = dict.next[x]) {
              const end = dict.walk(x, below);
              if (end !== -1 && dict.term[end]) mask |= 1 << dict.letter[x];
            }
          }
          cross[i] = mask;
        }
        anchor[i] = empty
          ? (i === CENTER ? 1 : 0)
          : ((above || below || filled(r, c - 1) || filled(r, c + 1)) ? 1 : 0);
      }
    }

    const left = [];
    const right = [];

    const record = (r, anchorCol) => {
      const start = anchorCol - left.length;
      const placed = left.map((t, k) => ({ r, c: start + k, l: t.l, b: t.b }));
      for (const t of right) placed.push({ r, c: t.c, l: t.l, b: t.b });
      emit(placed);
    };

    const extendRight = (r, c, node, anchorCol) => {
      if (c >= SIZE || !board[r * SIZE + c]) {
        if (dict.term[node] && c > anchorCol) record(r, anchorCol);
        if (c >= SIZE) return;
        const mask = cross[r * SIZE + c];
        for (let x = dict.first[node]; x !== -1; x = dict.next[x]) {
          const L = dict.letter[x];
          if (!((mask >> L) & 1)) continue;
          if (counts[L] > 0) {
            counts[L]--;
            right.push({ c, l: chr(L), b: false });
            extendRight(r, c + 1, x, anchorCol);
            right.pop();
            counts[L]++;
          }
          if (counts[BLANK] > 0) {
            counts[BLANK]--;
            right.push({ c, l: chr(L), b: true });
            extendRight(r, c + 1, x, anchorCol);
            right.pop();
            counts[BLANK]++;
          }
        }
      } else {
        const x = dict.child(node, code(board[r * SIZE + c].l));
        if (x !== -1) extendRight(r, c + 1, x, anchorCol);
      }
    };

    const leftPart = (r, anchorCol, node, limit) => {
      extendRight(r, anchorCol, node, anchorCol);
      if (limit <= 0) return;
      for (let x = dict.first[node]; x !== -1; x = dict.next[x]) {
        const L = dict.letter[x];
        if (counts[L] > 0) {
          counts[L]--;
          left.push({ l: chr(L), b: false });
          leftPart(r, anchorCol, x, limit - 1);
          left.pop();
          counts[L]++;
        }
        if (counts[BLANK] > 0) {
          counts[BLANK]--;
          left.push({ l: chr(L), b: true });
          leftPart(r, anchorCol, x, limit - 1);
          left.pop();
          counts[BLANK]++;
        }
      }
    };

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!anchor[r * SIZE + c]) continue;
        if (filled(r, c - 1)) {
          // Tiles already on the board to the left form a fixed prefix.
          let k = c - 1;
          while (filled(r, k - 1)) k--;
          let node = 0;
          for (let j = k; j < c && node !== -1; j++) node = dict.child(node, code(board[r * SIZE + j].l));
          if (node !== -1) extendRight(r, c, node, c);
        } else {
          let limit = 0;
          for (let k = c - 1; k >= 0 && !board[r * SIZE + k] && !anchor[r * SIZE + k]; k--) limit++;
          leftPart(r, c, 0, Math.min(limit, 6));
        }
      }
    }
  }

  // All legal moves for `rack` (array of letters, '?' = blank), best first.
  function generateMoves(board, rack, dict) {
    const counts = new Int8Array(27);
    for (const l of rack) counts[l === '?' ? BLANK : code(l)]++;

    const seen = new Set();
    const moves = [];
    const add = (placed, horizontal) => {
      const key = placed.map((p) => `${p.r},${p.c},${p.l}${p.b ? '*' : ''}`).sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const { words, score, bingo } = scorePlacement(board, placed, horizontal);
      moves.push({ placed, words, score, bingo });
    };

    generateAcross(board, counts, dict, (placed) => add(placed, true));
    generateAcross(transpose(board), counts, dict, (placed) =>
      add(placed.map((p) => ({ r: p.c, c: p.r, l: p.l, b: p.b })), false));

    moves.sort((a, b) => b.score - a.score);
    return moves;
  }

  // Pick a move for the computer at the given difficulty.
  function chooseMove(moves, level, random = Math.random) {
    if (!moves.length) return null;
    if (level === 'hard') return moves[0];
    const best = moves[0].score;
    const pick = (list) => list[Math.floor(random() * list.length)];
    if (level === 'medium') {
      const pool = moves.filter((m) => m.score >= best * 0.55 && m.score <= best * 0.85);
      return pool.length ? pick(pool) : moves[Math.min(moves.length - 1, Math.floor(moves.length * 0.1))];
    }
    // Easy: modest scores and short words.
    const cap = Math.max(8, best * 0.35);
    const pool = moves.filter((m) => m.score <= cap && m.placed.length <= 4);
    return pool.length ? pick(pool) : moves[moves.length - 1];
  }

  const api = {
    SIZE, CENTER, VALUES, DISTRIBUTION, PREMIUM,
    Dictionary, newBag, rackValue, validateMove, scorePlacement, generateMoves, chooseMove,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
