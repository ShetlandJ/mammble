(function () {
  'use strict';

  const E = window.Engine;
  const SIZE = E.SIZE;
  const SAVE_KEY = 'mammble-game-v1';
  const LEVEL_KEY = 'mammble-level';
  const LEVELS = {
    easy: { name: 'Easy', blurb: 'The computer plays short, simple words.' },
    medium: { name: 'Medium', blurb: 'A fair game. Good words, but not always the best.' },
    hard: { name: 'Hard', blurb: 'The computer plays the highest-scoring word it can find.' },
  };
  const THINKING = 'The computer is thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  const PREMIUM_LABELS ={ TW: ['3×', 'WORD'], DW: ['2×', 'WORD'], TL: ['3×', 'LETTER'], DL: ['2×', 'LETTER'] };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    board: $('#board'), rack: $('#rack'), rackArea: $('#rack-area'), status: $('#status'),
    history: $('#history'), bag: $('#bag'), ptsYou: $('#pts-you'), ptsCpu: $('#pts-cpu'),
    scoreYou: $('#score-you'), scoreCpu: $('#score-cpu'),
    play: $('#btn-play'), takeback: $('#btn-takeback'), shuffle: $('#btn-shuffle'), hint: $('#btn-hint'),
    swap: $('#btn-swap'), pass: $('#btn-pass'), newGame: $('#btn-new'),
    controls: $('#controls'), swapControls: $('#swap-controls'), swapGo: $('#btn-swap-go'), swapCancel: $('#btn-swap-cancel'),
    overlay: $('#overlay'), dlgTitle: $('#dialog-title'), dlgBody: $('#dialog-body'), dlgButtons: $('#dialog-buttons'),
  };

  let dict = null;
  let state = null;     // the saved game
  let pending = [];     // tiles placed this turn but not yet played: { id, r, c, l, b }
  let selectedId = null;
  let swapMode = false;
  let swapChosen = new Set();
  let thinking = false;
  let squares = [];

  // ---------- Game state ----------

  function drawTiles(n) {
    const out = [];
    while (n-- > 0 && state.bag.length) out.push({ id: state.nextId++, l: state.bag.pop() });
    return out;
  }

  function startGame(level) {
    localStorage.setItem(LEVEL_KEY, level);
    state = {
      level,
      bag: E.newBag(),
      nextId: 1,
      board: new Array(SIZE * SIZE).fill(null),
      racks: { you: [], cpu: [] },
      scores: { you: 0, cpu: 0 },
      history: [],
      scoreless: 0,
      turn: 'you',
      lastCpu: [],
      over: null,
    };
    state.racks.you = drawTiles(7);
    state.racks.cpu = drawTiles(7);
    resetTurnUi();
    save();
    render();
    setStatus(`New game on ${LEVELS[level].name}. You go first. Tap one of your tiles, then tap a square on the board.`);
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && Array.isArray(s.board) && s.racks) return s;
    } catch (e) { /* ignore a broken save */ }
    return null;
  }

  function resetTurnUi() {
    pending = [];
    selectedId = null;
    swapMode = false;
    swapChosen = new Set();
  }

  const myTurn = () => state && !state.over && state.turn === 'you' && !thinking;
  const letters = (rack) => rack.map((t) => t.l);
  const pendingAt = (i) => pending.find((p) => p.r * SIZE + p.c === i);

  // ---------- Rendering ----------

  function buildBoard() {
    el.board.innerHTML = '';
    squares = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const sq = document.createElement('div');
      const prem = E.PREMIUM[i];
      sq.className = 'sq' + (prem ? ' ' + prem.toLowerCase() : '');
      sq.dataset.i = i;
      sq.setAttribute('role', 'gridcell');
      el.board.appendChild(sq);
      squares.push(sq);
    }
  }

  function tileHtml(l, b) {
    const value = b ? 0 : E.VALUES[l];
    return `<span class="letter" aria-hidden="true">${l === '?' ? '' : l}</span><span class="val" aria-hidden="true">${value}</span>`;
  }

  function renderBoard() {
    const recent = new Set(state.lastCpu.map(([r, c]) => r * SIZE + c));
    for (let i = 0; i < SIZE * SIZE; i++) {
      const sq = squares[i];
      const cell = state.board[i];
      const p = pendingAt(i);
      let html = '';
      if (cell || p) {
        const t = cell || p;
        const cls = ['tile'];
        if (t.b) cls.push('blank');
        if (p) cls.push('pending');
        if (cell && recent.has(i)) cls.push('recent');
        html = `<div class="${cls.join(' ')}"${p ? ` data-id="${p.id}"` : ''}>${tileHtml(t.l, t.b)}</div>`;
        sq.setAttribute('aria-label', `${t.l}${p ? ' (not played yet)' : ''}`);
      } else if (i === E.CENTER) {
        html = '<span class="star" aria-hidden="true">★</span>';
        sq.setAttribute('aria-label', 'Centre star, double word');
      } else if (E.PREMIUM[i]) {
        const [a, b] = PREMIUM_LABELS[E.PREMIUM[i]];
        html = `<span class="prem" aria-hidden="true">${a}<br>${b}</span>`;
        sq.setAttribute('aria-label', `${a} ${b.toLowerCase()}`);
      } else {
        sq.removeAttribute('aria-label');
      }
      if (sq.innerHTML !== html) sq.innerHTML = html;
      sq.classList.toggle('can-drop', selectedId !== null && !cell && !p);
    }
  }

  function renderRack() {
    const used = new Set(pending.map((p) => p.id));
    el.rack.innerHTML = '';
    for (const t of state.racks.you) {
      if (used.has(t.id)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile' + (t.l === '?' ? ' blank' : '')
        + (t.id === selectedId ? ' selected' : '')
        + (swapChosen.has(t.id) ? ' swap-chosen' : '');
      b.dataset.id = t.id;
      b.innerHTML = tileHtml(t.l, false);
      b.setAttribute('aria-label', t.l === '?' ? 'Blank tile, can be any letter' : `${t.l}, ${E.VALUES[t.l]} points`);
      el.rack.appendChild(b);
    }
  }

  function renderHistory() {
    if (!state.history.length) {
      el.history.innerHTML = '<li class="empty">No words yet.</li>';
      return;
    }
    el.history.innerHTML = state.history.map((h) => {
      const who = h.who === 'you' ? 'You' : 'Computer';
      let what;
      if (h.type === 'play') {
        what = h.words.map((w) => w.word).join(', ') + (h.bingo ? ' (all 7 tiles!)' : '');
      } else if (h.type === 'swap') {
        what = `Swapped ${h.count} tile${h.count === 1 ? '' : 's'}`;
      } else if (h.type === 'pass') {
        what = 'Passed';
      } else {
        what = h.text;
      }
      const pts = h.type === 'play' || h.type === 'end' ? (h.score > 0 ? `+${h.score}` : `${h.score}`) : '';
      return `<li><span class="h-who">${who}</span><span class="h-what">${what}</span><span class="h-pts">${pts}</span></li>`;
    }).join('');
  }

  function render() {
    el.ptsYou.textContent = state.scores.you;
    el.ptsCpu.textContent = state.scores.cpu;
    el.scoreYou.classList.toggle('active', !state.over && state.turn === 'you');
    el.scoreCpu.classList.toggle('active', !state.over && state.turn === 'cpu');
    el.scoreCpu.classList.toggle('thinking', thinking);
    el.bag.innerHTML = `<span class="bag-long">Tiles in bag:</span><span class="bag-short">Bag:</span> ${state.bag.length}`;
    renderBoard();
    renderRack();
    renderHistory();
    renderButtons();
  }

  function renderButtons() {
    const mine = myTurn();
    el.controls.hidden = swapMode;
    el.swapControls.hidden = !swapMode;
    el.takeback.disabled = !mine || !pending.length;
    el.shuffle.disabled = !mine;
    el.hint.disabled = !mine;
    el.swap.disabled = !mine;
    el.pass.disabled = !mine;
    el.swapGo.disabled = !swapChosen.size;
    el.swapGo.textContent = swapChosen.size
      ? `Swap ${swapChosen.size} tile${swapChosen.size === 1 ? '' : 's'}`
      : 'Swap chosen tiles';
    updatePreview();
  }

  function setStatus(html, kind = '') {
    el.status.innerHTML = html;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  // Show what the pending tiles would score, or why they can't be played.
  function updatePreview() {
    if (!myTurn() || swapMode) {
      el.play.disabled = true;
      el.play.textContent = 'Play word';
      return;
    }
    if (!pending.length) {
      el.play.disabled = true;
      el.play.textContent = 'Play word';
      return;
    }
    const v = E.validateMove(state.board, pending, dict);
    if (v.ok) {
      const main = v.words.map((w) => `<strong>${w.word}</strong>`).join(', ');
      const bonus = v.bingo ? ' That includes 50 bonus points for using all 7 tiles!' : '';
      setStatus(`${main} scores <strong>${v.score} points</strong>.${bonus} Tap “Play word” when you’re happy.`, 'good');
      el.play.disabled = false;
      el.play.textContent = `Play word for ${v.score} points`;
    } else {
      let msg = v.error;
      if (v.invalid) {
        const bold = v.invalid.map((w) => `<strong>${w}</strong>`);
        const list = bold.length === 1 ? bold[0] : `${bold.slice(0, -1).join(', ')} and ${bold[bold.length - 1]}`;
        msg = `Sorry, ${list} ${bold.length === 1 ? 'isn’t' : 'aren’t'} in the dictionary.`;
      }
      setStatus(msg, 'error');
      el.play.disabled = true;
      el.play.textContent = 'Play word';
    }
  }

  // ---------- Placing tiles ----------

  function placeTile(id, i) {
    if (state.board[i] || pendingAt(i)) return;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const existing = pending.find((p) => p.id === id);
    if (existing) {
      existing.r = r;
      existing.c = c;
      selectedId = null;
      render();
      return;
    }
    const tile = state.racks.you.find((t) => t.id === id);
    if (!tile) return;
    if (tile.l === '?') {
      chooseBlankLetter((l) => {
        pending.push({ id, r, c, l, b: true });
        selectedId = null;
        render();
      });
      return;
    }
    pending.push({ id, r, c, l: tile.l, b: false });
    selectedId = null;
    render();
  }

  function returnTile(id) {
    pending = pending.filter((p) => p.id !== id);
    render();
    if (!pending.length) yourTurnMessage();
  }

  function takeBack() {
    pending = [];
    selectedId = null;
    render();
    yourTurnMessage();
  }

  function yourTurnMessage() {
    setStatus('Your turn. Tap one of your tiles, then tap a square on the board.');
  }

  function chooseBlankLetter(done) {
    const body = document.createElement('div');
    body.innerHTML = '<p>A blank tile can be any letter. It scores no points. Which letter should it be?</p>';
    const grid = document.createElement('div');
    grid.className = 'letter-grid';
    for (let k = 0; k < 26; k++) {
      const l = String.fromCharCode(65 + k);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = l;
      b.addEventListener('click', () => { closeDialog(); done(l); });
      grid.appendChild(b);
    }
    body.appendChild(grid);
    showDialog('Choose a letter', body, [{ label: 'Cancel' }]);
  }

  // ---------- Turns ----------

  function commitPlay(who, placed, result) {
    const rack = state.racks[who];
    for (const p of placed) {
      state.board[p.r * SIZE + p.c] = { l: p.l, b: p.b };
      const idx = p.id !== undefined
        ? rack.findIndex((t) => t.id === p.id)
        : rack.findIndex((t) => t.l === (p.b ? '?' : p.l));
      rack.splice(idx, 1);
    }
    rack.push(...drawTiles(7 - rack.length));
    state.scores[who] += result.score;
    state.scoreless = 0;
    state.history.unshift({
      who, type: 'play', score: result.score, bingo: result.bingo,
      words: result.words.map((w) => ({ word: w.word, score: w.score })),
    });
  }

  function playWord() {
    if (!myTurn() || !pending.length) return;
    const v = E.validateMove(state.board, pending, dict);
    if (!v.ok) { updatePreview(); return; }
    commitPlay('you', pending, v);
    state.lastCpu = [];
    const words = v.words.map((w) => w.word).join(', ');
    resetTurnUi();
    endTurn('you', `Well done! ${words} scored ${v.score} points.`);
  }

  function swapTiles() {
    const rack = state.racks.you;
    const out = rack.filter((t) => swapChosen.has(t.id));
    state.racks.you = rack.filter((t) => !swapChosen.has(t.id));
    state.racks.you.push(...drawTiles(out.length));
    returnToBag(out.map((t) => t.l));
    state.scoreless++;
    state.history.unshift({ who: 'you', type: 'swap', count: out.length });
    state.lastCpu = [];
    resetTurnUi();
    endTurn('you', `You swapped ${out.length} tile${out.length === 1 ? '' : 's'}.`);
  }

  function returnToBag(ls) {
    state.bag.push(...ls);
    for (let i = state.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }

  function pass() {
    state.scoreless++;
    state.history.unshift({ who: 'you', type: 'pass' });
    state.lastCpu = [];
    resetTurnUi();
    endTurn('you', 'You passed.');
  }

  function endTurn(who, message) {
    if (!state.bag.length && !state.racks[who].length) return finishGame(who);
    if (state.scoreless >= 6) return finishGame(null);
    state.turn = who === 'you' ? 'cpu' : 'you';
    save();
    render();
    if (state.turn === 'cpu') {
      setStatus(`${message}<br>${THINKING}`, 'good');
      computerTurn();
    } else {
      setStatus(`${message} Your turn.`);
    }
  }

  function computerTurn() {
    thinking = true;
    render();
    const started = Date.now();
    // Let the "thinking" message paint before the search runs.
    setTimeout(() => {
      const rack = state.racks.cpu;
      const moves = E.generateMoves(state.board, letters(rack), dict);
      const move = E.chooseMove(moves, state.level);
      // A random 2 to 4.5 second pause, so the computer seems to think it over.
      const wait = Math.max(0, 2000 + Math.random() * 2500 - (Date.now() - started));
      setTimeout(() => {
        thinking = false;
        let message;
        if (move) {
          commitPlay('cpu', move.placed, move);
          state.lastCpu = move.placed.map((p) => [p.r, p.c]);
          const words = move.words.map((w) => w.word).join(', ');
          message = `The computer played <strong>${words}</strong> for ${move.score} points (shown in yellow).`;
        } else if (state.bag.length >= 7) {
          const out = rack.splice(0, rack.length);
          rack.push(...drawTiles(out.length));
          returnToBag(out.map((t) => t.l));
          state.scoreless++;
          state.lastCpu = [];
          state.history.unshift({ who: 'cpu', type: 'swap', count: out.length });
          message = `The computer couldn’t find a word, so it swapped ${out.length} tiles.`;
        } else {
          state.scoreless++;
          state.lastCpu = [];
          state.history.unshift({ who: 'cpu', type: 'pass' });
          message = 'The computer couldn’t find a word, so it passed.';
        }
        endTurn('cpu', message);
      }, wait);
    }, 60);
  }

  function finishGame(outPlayer) {
    const youLeft = E.rackValue(letters(state.racks.you));
    const cpuLeft = E.rackValue(letters(state.racks.cpu));
    const notes = [];
    if (outPlayer) {
      const other = outPlayer === 'you' ? 'cpu' : 'you';
      const left = outPlayer === 'you' ? cpuLeft : youLeft;
      state.scores[outPlayer] += left;
      state.scores[other] -= left;
      if (left) {
        state.history.unshift({ who: other, type: 'end', score: -left, text: 'Tiles left over' });
        state.history.unshift({ who: outPlayer, type: 'end', score: left, text: 'Used all tiles' });
      }
      notes.push(outPlayer === 'you'
        ? `You used all your tiles! The computer had ${cpuLeft} points of tiles left, so those were added to your score and taken off the computer’s.`
        : `The computer used all its tiles. You had ${youLeft} points of tiles left, so those were taken off your score and added to the computer’s.`);
    } else {
      state.scores.you -= youLeft;
      state.scores.cpu -= cpuLeft;
      if (youLeft) state.history.unshift({ who: 'you', type: 'end', score: -youLeft, text: 'Tiles left over' });
      if (cpuLeft) state.history.unshift({ who: 'cpu', type: 'end', score: -cpuLeft, text: 'Tiles left over' });
      notes.push('Nobody has scored for six turns in a row, so the game is over. Each player loses the points on the tiles they have left.');
    }
    const { you, cpu } = state.scores;
    const winner = you > cpu ? 'you' : cpu > you ? 'cpu' : 'draw';
    state.over = { winner, notes };
    state.turn = null;
    resetTurnUi();
    save();
    render();
    showGameOver();
  }

  function showGameOver() {
    const { you, cpu } = state.scores;
    const title = state.over.winner === 'you' ? 'You won!' : state.over.winner === 'cpu' ? 'The computer won this time' : 'It’s a draw!';
    const body = document.createElement('div');
    body.innerHTML = `<p><strong>You: ${you}</strong> &nbsp; Computer: ${cpu}</p>`
      + state.over.notes.map((n) => `<p>${n}</p>`).join('');
    showDialog(title, body, [
      { label: 'Play again', primary: true, action: () => chooseLevel() },
      { label: 'Look at the board' },
    ]);
    setStatus(`Game over. ${title} Tap “New game” to play again.`, 'good');
  }

  // ---------- Hint ----------

  function hint() {
    if (!myTurn()) return;
    pending = [];
    selectedId = null;
    const moves = E.generateMoves(state.board, letters(state.racks.you), dict);
    if (!moves.length) {
      render();
      setStatus('I can’t find any word with these tiles. Try “Swap tiles” to get new letters.', 'error');
      return;
    }
    // Suggest the best move, but avoid spending a blank unless it's worth it.
    const best = moves[0];
    const noBlank = moves.find((m) => !m.placed.some((p) => p.b));
    const move = noBlank && !best.bingo && best.score - noBlank.score < 15 ? noBlank : best;

    const free = [...state.racks.you];
    for (const p of move.placed) {
      const k = free.findIndex((t) => t.l === (p.b ? '?' : p.l));
      pending.push({ id: free[k].id, r: p.r, c: p.c, l: p.l, b: p.b });
      free.splice(k, 1);
    }
    render();
    const words = move.words.map((w) => `<strong>${w.word}</strong>`).join(', ');
    setStatus(`Hint: how about ${words} for <strong>${move.score} points</strong>? Tap “Play word” to use it, or “Take back” to try your own.`, 'good');
  }

  // ---------- Dialogs ----------

  function showDialog(title, body, buttons) {
    el.dlgTitle.textContent = title;
    el.dlgBody.innerHTML = '';
    if (typeof body === 'string') el.dlgBody.innerHTML = `<p>${body}</p>`;
    else el.dlgBody.appendChild(body);
    el.dlgButtons.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.primary ? ' btn-play' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { closeDialog(); if (b.action) b.action(); });
      el.dlgButtons.appendChild(btn);
    }
    el.overlay.hidden = false;
    const focus = el.dlgButtons.querySelector('.btn-play') || el.overlay.querySelector('button');
    if (focus) focus.focus();
  }

  function closeDialog() { el.overlay.hidden = true; }

  function confirmDialog(title, text, yes, onYes) {
    showDialog(title, text, [{ label: yes, primary: true, action: onYes }, { label: 'Cancel' }]);
  }

  function chooseLevel() {
    const current = localStorage.getItem(LEVEL_KEY) || 'medium';
    const body = document.createElement('div');
    body.innerHTML = '<p>How strong should the computer be?</p>';
    const list = document.createElement('div');
    list.className = 'level-buttons';
    for (const key of Object.keys(LEVELS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (key === current ? ' current' : '');
      b.innerHTML = `${LEVELS[key].name}<small>${LEVELS[key].blurb}</small>`;
      b.addEventListener('click', () => { closeDialog(); startGame(key); });
      list.appendChild(b);
    }
    body.appendChild(list);
    const canCancel = state && !state.over && state.history.length;
    showDialog('New game', body, canCancel ? [{ label: 'Keep playing this game' }] : []);
  }

  // ---------- Input: tap and drag ----------

  let drag = null;
  let suppressClick = false;

  function onPointerDown(e) {
    if (!myTurn() || swapMode || e.button > 0) return;
    const t = e.target.closest('.rack .tile, .sq .tile.pending');
    if (!t) return;
    drag = { id: Number(t.dataset.id), el: t, x: e.clientX, y: e.clientY, moving: false, ghost: null, over: null };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
      drag.moving = true;
      const rect = drag.el.getBoundingClientRect();
      const g = drag.el.cloneNode(true);
      g.classList.remove('selected', 'pending');
      g.classList.add('drag-ghost');
      g.style.width = `${Math.max(rect.width, 48)}px`;
      g.style.height = `${Math.max(rect.height, 48)}px`;
      g.style.fontSize = `${Math.max(rect.height, 48) * 0.6}px`;
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add('dragging');
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const sq = dropSquare(e);
    if (drag.over !== sq) {
      if (drag.over) drag.over.classList.remove('drop-hover');
      if (sq) sq.classList.add('drop-hover');
      drag.over = sq;
    }
  }

  function dropSquare(e) {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const sq = hit && hit.closest('.sq');
    if (!sq) return null;
    const i = Number(sq.dataset.i);
    return state.board[i] || pendingAt(i) ? null : sq;
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moving) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    d.ghost.remove();
    d.el.classList.remove('dragging');
    if (d.over) d.over.classList.remove('drop-hover');
    const sq = e.type === 'pointerup' ? dropSquare(e) : null;
    if (sq) {
      placeTile(d.id, Number(sq.dataset.i));
    } else {
      const hit = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY);
      if (hit && hit.closest('#rack-area') && pending.some((p) => p.id === d.id)) returnTile(d.id);
      else render();
    }
  }

  function onRackClick(e) {
    if (suppressClick || !myTurn()) return;
    const t = e.target.closest('.tile');
    if (!t) return;
    const id = Number(t.dataset.id);
    if (swapMode) {
      if (swapChosen.has(id)) swapChosen.delete(id); else swapChosen.add(id);
    } else {
      selectedId = selectedId === id ? null : id;
      if (selectedId !== null) setStatus('Now tap a square on the board to put the tile there.');
      else if (!pending.length) yourTurnMessage();
    }
    render();
  }

  function onBoardClick(e) {
    if (suppressClick || !myTurn() || swapMode) return;
    const sq = e.target.closest('.sq');
    if (!sq) return;
    const i = Number(sq.dataset.i);
    const p = pendingAt(i);
    if (p) {
      returnTile(p.id);
    } else if (!state.board[i] && selectedId !== null) {
      placeTile(selectedId, i);
    } else if (!state.board[i] && !pending.length) {
      setStatus('First tap one of your tiles at the bottom, then tap this square.');
    }
  }

  // ---------- Buttons ----------

  function wireButtons() {
    el.play.addEventListener('click', playWord);
    el.takeback.addEventListener('click', takeBack);
    el.shuffle.addEventListener('click', () => {
      const r = state.racks.you;
      for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
      }
      save();
      render();
    });
    el.hint.addEventListener('click', hint);
    el.swap.addEventListener('click', () => {
      if (state.bag.length < 7) {
        setStatus('There aren’t enough tiles left in the bag to swap. You can pass instead.', 'error');
        return;
      }
      pending = [];
      selectedId = null;
      swapMode = true;
      swapChosen = new Set();
      render();
      setStatus('Tap the tiles you want to swap, then tap “Swap”. Swapping uses up your turn.');
    });
    el.swapGo.addEventListener('click', swapTiles);
    el.swapCancel.addEventListener('click', () => {
      swapMode = false;
      swapChosen = new Set();
      render();
      yourTurnMessage();
    });
    el.pass.addEventListener('click', () => {
      confirmDialog('Pass your turn?', 'You won’t score anything this turn, and the computer will go next.', 'Yes, pass', () => {
        pending = [];
        pass();
      });
    });
    el.newGame.addEventListener('click', () => {
      if (state && !state.over && state.history.length) {
        confirmDialog('Start a new game?', 'This will end the game you’re playing now.', 'Yes, new game', chooseLevel);
      } else {
        chooseLevel();
      }
    });

    el.rack.addEventListener('click', onRackClick);
    el.board.addEventListener('click', onBoardClick);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  // ---------- Sizing ----------

  function fit() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const landscape = w > h && w >= 700;
    document.body.classList.toggle('landscape', landscape);
    const root = document.documentElement.style;
    const rackWidth = landscape ? 380 - 20 : Math.min(w - 16, 640) - 20;
    const rackTile = Math.floor(Math.min(76, (rackWidth - 6 * 6) / 7));
    root.setProperty('--rack-tile', `${rackTile}px`);

    const header = document.querySelector('.topbar').offsetHeight;
    const legend = document.querySelector('.legend').offsetHeight + 8;
    let size;
    if (landscape) {
      size = Math.min(h - header - legend - 36, w - 380 - 52);
    } else if (w < 600) {
      // Phones: use the full width and let the page scroll a little.
      size = w - 16;
    } else {
      // Tablets in portrait: keep the tiles and buttons on screen under the board.
      const controls = el.controls.hidden ? 140 : el.controls.offsetHeight;
      const below = 96 + (rackTile + 20) + controls + 3 * 12 + 36;
      size = Math.min(w - 16, h - header - legend - 12 - below);
    }
    size = Math.max(size, Math.min(w - 16, 300));
    const gap = size > 500 ? 3 : 2;
    root.setProperty('--gap', `${gap}px`);
    root.setProperty('--sq', `${Math.floor((size - gap * 16) / 15)}px`);
  }

  // ---------- Start ----------

  function init() {
    buildBoard();
    wireButtons();
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 200));

    // Build the dictionary after the first paint so the page shows straight away.
    setTimeout(() => {
      dict = new E.Dictionary(self.MAMMBLE_WORDS);
      self.MAMMBLE_WORDS = null;
      state = load();
      if (!state) {
        startGame(localStorage.getItem(LEVEL_KEY) || 'medium');
        chooseLevel();
        return;
      }
      resetTurnUi();
      render();
      if (state.over) {
        setStatus('Game over. Tap “New game” to play again.', 'good');
      } else if (state.turn === 'cpu') {
        setStatus(`Welcome back! ${THINKING}`);
        computerTurn();
      } else {
        setStatus('Welcome back! Your game has been saved. It’s your turn.');
      }
    }, 30);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
