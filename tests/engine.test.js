// Run with: node tests/engine.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');

const t0 = Date.now();
const dict = new E.Dictionary(fs.readFileSync(path.join(__dirname, '..', 'words.txt'), 'utf8'));
console.log(`dictionary: ${dict.size} words in ${Date.now() - t0}ms`);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}

const emptyBoard = () => new Array(225).fill(null);
const at = (r, c) => r * 15 + c;
// Lay a word straight onto a board (no validation), for setting up positions.
function lay(board, word, r, c, horizontal = true) {
  [...word].forEach((l, k) => {
    board[horizontal ? at(r, c + k) : at(r + k, c)] = { l, b: false };
  });
  return board;
}
// Build placements for a word, skipping squares already filled.
function place(board, word, r, c, horizontal = true, blanks = []) {
  const out = [];
  [...word].forEach((l, k) => {
    const rr = horizontal ? r : r + k;
    const cc = horizontal ? c + k : c;
    if (!board[at(rr, cc)]) out.push({ r: rr, c: cc, l, b: blanks.includes(k) });
  });
  return out;
}

test('tile bag has 100 tiles including 2 blanks', () => {
  const bag = E.newBag();
  assert.equal(bag.length, 100);
  assert.equal(bag.filter((l) => l === '?').length, 2);
});

test('premium squares are laid out symmetrically', () => {
  const count = (t) => E.PREMIUM.filter((p) => p === t).length;
  assert.equal(count('TW'), 8);
  assert.equal(count('DW'), 17);
  assert.equal(count('TL'), 12);
  assert.equal(count('DL'), 24);
  assert.equal(E.PREMIUM[E.CENTER], 'DW');
});

test('dictionary lookups', () => {
  assert.ok(dict.has('QUIZ'));
  assert.ok(dict.has('cat'));
  assert.ok(dict.has('FOLEYS'));
  assert.ok(dict.has('QI'));
  assert.ok(!dict.has('QUIZE'));
  assert.ok(!dict.has('XQZ'));
});

test('first move must cover the centre star', () => {
  const r = E.validateMove(emptyBoard(), place(emptyBoard(), 'CAT', 0, 0), dict);
  assert.equal(r.ok, false);
  assert.match(r.error, /star/);
});

test('first move needs two letters', () => {
  const r = E.validateMove(emptyBoard(), [{ r: 7, c: 7, l: 'A', b: false }], dict);
  assert.match(r.error, /two letters/);
});

test('first move score: CAT across the centre doubles', () => {
  const r = E.validateMove(emptyBoard(), place(emptyBoard(), 'CAT', 7, 6), dict);
  assert.ok(r.ok);
  assert.equal(r.score, (3 + 1 + 1) * 2);
});

test('tiles must be in a line', () => {
  const r = E.validateMove(emptyBoard(), [
    { r: 7, c: 7, l: 'A', b: false }, { r: 8, c: 8, l: 'T', b: false },
  ], dict);
  assert.match(r.error, /straight line/);
});

test('gaps are rejected', () => {
  const r = E.validateMove(emptyBoard(), [
    { r: 7, c: 6, l: 'C', b: false }, { r: 7, c: 8, l: 'T', b: false },
  ], dict);
  assert.match(r.error, /gap/);
});

test('gap filled by an existing tile is fine', () => {
  const b = lay(emptyBoard(), 'A', 7, 7);
  const r = E.validateMove(b, [
    { r: 7, c: 6, l: 'C', b: false }, { r: 7, c: 8, l: 'T', b: false },
  ], dict);
  assert.ok(r.ok, r.error);
  assert.equal(r.words[0].word, 'CAT');
  assert.equal(r.score, 5); // centre bonus already used
});

test('later moves must connect', () => {
  const b = lay(emptyBoard(), 'CAT', 7, 6);
  const r = E.validateMove(b, place(b, 'DOG', 0, 0), dict);
  assert.match(r.error, /join onto/);
});

test('invalid word gives a friendly message', () => {
  const r = E.validateMove(emptyBoard(), place(emptyBoard(), 'QUIZE', 7, 5), dict);
  assert.equal(r.ok, false);
  assert.equal(r.error, "QUIZE isn't in the dictionary.");
});

test('multiple invalid words are listed', () => {
  const b = lay(emptyBoard(), 'CAT', 7, 6);
  // XX below C and A forms XX across plus CX and AX down
  const r = E.validateMove(b, [{ r: 8, c: 6, l: 'X', b: false }, { r: 8, c: 7, l: 'X', b: false }], dict);
  assert.equal(r.ok, false);
  assert.match(r.error, /aren't in the dictionary/);
});

test('cross words are scored with bonuses only on new tiles', () => {
  // Hook S on CAT to make CATS, plus SO down.
  const b = lay(emptyBoard(), 'CAT', 7, 6);
  const placed = [{ r: 7, c: 9, l: 'S', b: false }, { r: 8, c: 9, l: 'O', b: false }];
  const r = E.validateMove(b, placed, dict);
  assert.ok(r.ok, r.error);
  const words = Object.fromEntries(r.words.map((w) => [w.word, w.score]));
  // SO down: S (7,9) and O (8,9) are plain squares -> 2
  assert.equal(words.SO, 2);
  // CATS: C3 A1 T1 S1 = 6; the old centre DW doesn't count again
  assert.equal(words.CATS, 6);
  assert.equal(r.score, 8);
});

test('double letter on a new tile counts in both words', () => {
  // O on (8,8), a DL square, under the T of CAT makes TO down
  const b = lay(emptyBoard(), 'CAT', 7, 6);
  const r = E.validateMove(b, [{ r: 8, c: 8, l: 'O', b: false }], dict);
  assert.ok(r.ok, r.error);
  assert.equal(r.words.length, 1);
  assert.equal(r.score, 1 + 1 * 2);
});

test('triple word square', () => {
  const b = lay(emptyBoard(), 'AT', 1, 0, true);
  const r = E.validateMove(b, place(b, 'TA', 0, 0), dict); // TA across; TA and AT down
  assert.ok(r.ok, r.error);
  const words = Object.fromEntries(r.words.map((w) => [w.word, w.score]));
  // TA across: T on (0,0) TW, A plain: (1+1)*3 = 6
  assert.equal(words.TA, 6);
});

test('triple letter square', () => {
  // O on (5,5) TL above X at (6,5) makes OX down: O (1*3) + X (8) = 11
  const b = lay(emptyBoard(), 'X', 6, 5);
  const r = E.validateMove(b, [{ r: 5, c: 5, l: 'O', b: false }], dict);
  assert.ok(r.ok, r.error);
  assert.equal(r.score, 11);
});

test('blank tiles score zero', () => {
  const placed = place(emptyBoard(), 'QUIZ', 7, 7, true, [0]);
  const r = E.validateMove(emptyBoard(), placed, dict);
  assert.ok(r.ok, r.error);
  // Q blank (0) on DW centre, U, I, Z(10) -> (0+1+1+10) * 2 = 24
  assert.equal(r.score, 24);
});

test('using all seven tiles earns 50 bonus points', () => {
  const placed = place(emptyBoard(), 'RETAINS', 7, 4);
  const r = E.validateMove(emptyBoard(), placed, dict);
  assert.ok(r.ok, r.error);
  assert.ok(r.bingo);
  // R E T A I N S = 7 points, DL at (7,3)? no: cols 4-10 row 7; (7,7) DW, (7,3)/(7,11) DL outside.
  assert.equal(r.score, 7 * 2 + 50);
});

test('move generator: opening moves are all valid and include RETAINS', () => {
  const moves = E.generateMoves(emptyBoard(), [...'RETAINS'], dict);
  assert.ok(moves.length > 100);
  assert.ok(moves.some((m) => m.words[0].word === 'RETAINS' || m.words[0].word === 'STAINER'));
  assert.ok(moves[0].bingo);
  for (const m of moves) {
    const v = E.validateMove(emptyBoard(), m.placed, dict);
    assert.ok(v.ok, `${JSON.stringify(m.placed)}: ${v.error}`);
    assert.equal(v.score, m.score);
  }
});

function randomMidGame(seed) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let board = emptyBoard();
  const bag = E.newBag(rand);
  for (let turn = 0; turn < 8; turn++) {
    const rack = bag.splice(0, 7);
    const moves = E.generateMoves(board, rack, dict);
    if (!moves.length) continue;
    const m = moves[Math.floor(rand() * Math.min(5, moves.length))];
    board = board.slice();
    for (const p of m.placed) board[at(p.r, p.c)] = { l: p.l, b: p.b };
  }
  return { board, rand, bag };
}

test('move generator: every generated move validates in mid-game positions', () => {
  for (const seed of [1, 7, 42]) {
    const { board, bag } = randomMidGame(seed);
    const rack = bag.slice(0, 7);
    const moves = E.generateMoves(board, rack, dict);
    assert.ok(moves.length > 0, `no moves for seed ${seed}`);
    for (const m of moves) {
      const v = E.validateMove(board, m.placed, dict);
      assert.ok(v.ok, `seed ${seed} ${JSON.stringify(m.placed)}: ${v.error}`);
      assert.equal(v.score, m.score);
    }
  }
});

test('move generator: finds a hook and a parallel play', () => {
  const b = lay(emptyBoard(), 'CAT', 7, 6);
  const moves = E.generateMoves(b, [...'SOXXXXX'], dict);
  const words = new Set(moves.flatMap((m) => m.words.map((w) => w.word)));
  assert.ok(words.has('CATS'));
});

test('move generator copes with two blanks quickly', () => {
  const { board } = randomMidGame(3);
  const start = Date.now();
  const moves = E.generateMoves(board, ['?', '?', 'E', 'R', 'S', 'T', 'A'], dict);
  const ms = Date.now() - start;
  console.log(`       (${moves.length} moves with two blanks in ${ms}ms)`);
  assert.ok(moves.length > 0);
  assert.ok(ms < 8000);
});

test('difficulty levels', () => {
  const moves = E.generateMoves(emptyBoard(), [...'RETAINS'], dict);
  assert.equal(E.chooseMove(moves, 'hard'), moves[0]);
  const easy = E.chooseMove(moves, 'easy', () => 0.5);
  assert.ok(easy.score < moves[0].score / 2);
  const med = E.chooseMove(moves, 'medium', () => 0.5);
  assert.ok(med.score < moves[0].score && med.score > easy.score);
  assert.equal(E.chooseMove([], 'hard'), null);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
