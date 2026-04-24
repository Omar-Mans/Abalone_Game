/*
 * Abalone board game implementation with optional AI opponent.
 *
 * This script encapsulates the complete game logic for Abalone using
 * modern vanilla JavaScript.  It builds the game board, manages user
 * interactions (selection and movement of marbles), tracks history,
 * integrates a Python-based minimax AI via Pyodide, and now includes
 * support for an initial start screen where the player chooses
 * between Human vs Human or Human vs AI modes.  After a mode is
 * selected the game board is revealed and the appropriate game
 * behaviour is activated.
 */

(() => {
  // ---------------------------------------------------------------------------
  // Geometry and board setup
  // ---------------------------------------------------------------------------
  /** The six axial directions for movement, indexed 0..5. */
  const DIRECTIONS = [
    { q: 1, r: 0 },   // 0 east
    { q: 1, r: -1 },  // 1 northeast
    { q: 0, r: -1 },  // 2 northwest
    { q: -1, r: 0 },  // 3 west
    { q: -1, r: 1 },  // 4 southwest
    { q: 0, r: 1 },   // 5 southeast
  ];

  /** Generate all coordinates for a hex board of radius 4 (61 cells). */
  function generateBoardCells() {
    const cells = [];
    for (let q = -4; q <= 4; q++) {
      for (let r = -4; r <= 4; r++) {
        const s = -q - r;
        if (s >= -4 && s <= 4) {
          cells.push({ q, r });
        }
      }
    }
    return cells;
  }

  const BOARD_CELLS = generateBoardCells();
  const BOARD_SET = new Set(BOARD_CELLS.map((c) => `${c.q},${c.r}`));

  /** Convert a coordinate into a string key. */
  function coordKey(c) {
    return `${c.q},${c.r}`;
  }

  /** Check whether a coordinate lies within the board boundaries. */
  function withinBoard(c) {
    return BOARD_SET.has(coordKey(c));
  }

  /** Add two axial coordinates. */
  function add(a, b) {
    return { q: a.q + b.q, r: a.r + b.r };
  }

  /** Dot product between a coordinate and a direction for sorting along a line. */
  function dot(c, dir) {
    return c.q * dir.q + c.r * dir.r;
  }

  /** Create the initial board map with marbles in the standard layout. */
  function initialBoard() {
    const board = new Map();
    // Initialize all cells to empty
    for (const cell of BOARD_CELLS) {
      board.set(coordKey(cell), 'EMPTY');
    }
    // Black marbles: top two rows fully and three central in row r = -2
    for (const cell of BOARD_CELLS) {
      if (cell.r === -4 || cell.r === -3) {
        board.set(coordKey(cell), 'BLACK');
      } else if (cell.r === -2) {
        if (cell.q >= 0 && cell.q <= 2) {
          board.set(coordKey(cell), 'BLACK');
        }
      }
    }
    // White marbles: bottom two rows fully and three central in row r = 2
    for (const cell of BOARD_CELLS) {
      if (cell.r === 4 || cell.r === 3) {
        board.set(coordKey(cell), 'WHITE');
      } else if (cell.r === 2) {
        if (cell.q >= -2 && cell.q <= 0) {
          board.set(coordKey(cell), 'WHITE');
        }
      }
    }
    return board;
  }

  /** Deep copy a board map. */
  function cloneBoard(src) {
    return new Map(src);
  }

  // ---------------------------------------------------------------------------
  // Selection and group validation
  // ---------------------------------------------------------------------------
  /** Check if two coordinates are adjacent on the hex board. */
  function isAdjacent(a, b) {
    return DIRECTIONS.some((dir) => a.q + dir.q === b.q && a.r + dir.r === b.r);
  }

  /** Determine whether a group of two or three cells forms a straight line. */
  function isLinearGroup(selection) {
    if (selection.length === 2) {
      return isAdjacent(selection[0], selection[1]);
    }
    if (selection.length === 3) {
      const sorted = [...selection].sort((a, b) => (a.q - b.q) || (a.r - b.r));
      const v1 = {
        q: sorted[1].q - sorted[0].q,
        r: sorted[1].r - sorted[0].r,
      };
      const v2 = {
        q: sorted[2].q - sorted[1].q,
        r: sorted[2].r - sorted[1].r,
      };
      return DIRECTIONS.some(
        (dir) => dir.q === v1.q && dir.r === v1.r && dir.q === v2.q && dir.r === v2.r
      );
    }
    return false;
  }

  /** Check whether a selection is valid for the given player. */
  function isValidSelection(board, selection, player) {
    if (selection.length < 1 || selection.length > 3) {
      return false;
    }
    // All selected cells must belong to the player
    for (const coord of selection) {
      if (board.get(coordKey(coord)) !== player) {
        return false;
      }
    }
    if (selection.length === 1) {
      return true;
    }
    // Check connectivity: every cell must be adjacent to at least one other
    for (const coord of selection) {
      const hasAdjacent = selection.some((other) => other !== coord && isAdjacent(coord, other));
      if (!hasAdjacent) return false;
    }
    return isLinearGroup(selection);
  }

  /** Determine the orientation index of a linear selection. */
  function getOrientation(selection) {
    if (selection.length <= 1) return undefined;
    // Sort to compute vector between first two cells
    const sorted = [...selection].sort((a, b) => (a.q - b.q) || (a.r - b.r));
    const v = {
      q: sorted[1].q - sorted[0].q,
      r: sorted[1].r - sorted[0].r,
    };
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      if (dir.q === v.q && dir.r === v.r) {
        return i;
      }
    }
    // Try reverse ordering
    const rev = [...selection].sort((a, b) => (b.q - a.q) || (b.r - a.r));
    const v2 = {
      q: rev[1].q - rev[0].q,
      r: rev[1].r - rev[0].r,
    };
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      if (dir.q === v2.q && dir.r === v2.r) {
        return i;
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Move validation
  // ---------------------------------------------------------------------------
  /** Check legality of a broadside move: each destination must be empty and in bounds. */
  function isLegalBroadside(board, selection, dir) {
    for (const cell of selection) {
      const dest = add(cell, dir);
      if (!withinBoard(dest)) return false;
      if (board.get(coordKey(dest)) !== 'EMPTY') return false;
    }
    return true;
  }

  /** Check legality of an inline move: may involve pushing opponent marbles. */
  function isLegalInline(board, selection, dir, player) {
    if (selection.length === 1) {
      const cell = selection[0];
      const dest = add(cell, dir);
      return withinBoard(dest) && board.get(coordKey(dest)) === 'EMPTY';
    }
    const orientation = getOrientation(selection);
    const dirIndex = DIRECTIONS.findIndex((d) => d.q === dir.q && d.r === dir.r);
    const opposite = (orientation !== undefined ? (orientation + 3) % 6 : undefined);
    if (!(dirIndex === orientation || dirIndex === opposite)) return false;
    const sorted = [...selection].sort((a, b) => dot(b, dir) - dot(a, dir));
    const front = sorted[0];
    let next = add(front, dir);
    if (!withinBoard(next)) {
      return false;
    }
    const occupant = board.get(coordKey(next));
    if (occupant === 'EMPTY') return true;
    if (occupant === player) return false;
    let oppCount = 0;
    const opponent = (player === 'BLACK' ? 'WHITE' : 'BLACK');
    let probe = next;
    while (withinBoard(probe) && board.get(coordKey(probe)) === opponent) {
      oppCount++;
      probe = add(probe, dir);
    }
    if (oppCount >= selection.length) return false;
    if (withinBoard(probe) && board.get(coordKey(probe)) !== 'EMPTY') return false;
    return true;
  }

  /** Compute the allowed directions (indices) for the current selection. */
  function getAllowedDirections(board, selection, player) {
    const allowed = [];
    if (!isValidSelection(board, selection, player)) return allowed;
    const orientation = getOrientation(selection);
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      const isInline = orientation !== undefined && (i === orientation || i === (orientation + 3) % 6);
      if (selection.length === 1) {
        if (isLegalBroadside(board, selection, dir)) allowed.push(i);
        continue;
      }
      if (isInline) {
        if (isLegalInline(board, selection, dir, player)) allowed.push(i);
      } else {
        if (isLegalBroadside(board, selection, dir)) allowed.push(i);
      }
    }
    return allowed;
  }

  // ---------------------------------------------------------------------------
  // Move application
  // ---------------------------------------------------------------------------
  function applyMove(board, selection, dirIndex, player) {
    const dir = DIRECTIONS[dirIndex];
    const newBoard = cloneBoard(board);
    const ejected = { BLACK: 0, WHITE: 0 };
    if (selection.length === 1) {
      const cell = selection[0];
      const dest = add(cell, dir);
      newBoard.set(coordKey(cell), 'EMPTY');
      newBoard.set(coordKey(dest), player);
      return { board: newBoard, ejected };
    }
    const orientation = getOrientation(selection);
    const inline = orientation !== undefined && (dirIndex === orientation || dirIndex === (orientation + 3) % 6);
    if (!inline) {
      for (const cell of selection) {
        const dest = add(cell, dir);
        newBoard.set(coordKey(cell), 'EMPTY');
        newBoard.set(coordKey(dest), player);
      }
      return { board: newBoard, ejected };
    }
    const ownSorted = [...selection].sort((a, b) => dot(b, dir) - dot(a, dir));
    const opponent = player === 'BLACK' ? 'WHITE' : 'BLACK';
    const lead = ownSorted[0];
    let next = add(lead, dir);
    const oppPositions = [];
    while (withinBoard(next) && newBoard.get(coordKey(next)) === opponent) {
      oppPositions.push(next);
      next = add(next, dir);
    }
    const oppSorted = [...oppPositions].sort((a, b) => dot(b, dir) - dot(a, dir));
    for (const opp of oppSorted) {
      const dest = add(opp, dir);
      const occ = newBoard.get(coordKey(opp));
      newBoard.set(coordKey(opp), 'EMPTY');
      if (withinBoard(dest)) {
        newBoard.set(coordKey(dest), occ);
      } else {
        ejected[occ]++;
      }
    }
    for (const own of ownSorted) {
      const dest = add(own, dir);
      const occ = newBoard.get(coordKey(own));
      newBoard.set(coordKey(own), 'EMPTY');
      if (withinBoard(dest)) {
        newBoard.set(coordKey(dest), occ);
      } else {
        ejected[occ]++;
      }
    }
    return { board: newBoard, ejected };
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let boardState = initialBoard();
  let currentPlayer = 'BLACK';
  let selected = [];
  let ejectedCounts = { BLACK: 0, WHITE: 0 };
  let history = [];
  let historyMoves = [];
  let winner = null;

  // ---------------------------------------------------------------------------
  // AI integration state
  // ---------------------------------------------------------------------------
  let gameMode = 'LOCAL'; // LOCAL, AI, or ONLINE
  const aiColor = 'WHITE';
  let aiThinking = false;
  let pyodide = null;
  let aiReady = false;

  // Online multiplayer state (PeerJS)
  let peer = null;
  let connection = null;
  let localColor = null;
  let roomCode = null;
  let onlineConnected = false;

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  const boardElem = document.getElementById('board');
  const controlsElem = document.getElementById('controls');
  const historyListElem = document.getElementById('history-list');
  const turnInfoElem = document.getElementById('turn-info');
  const ejectedBlackElem = document.getElementById('ejected-black');
  const ejectedWhiteElem = document.getElementById('ejected-white');
  const winnerElem = document.getElementById('winner-info');
  const undoBtn = document.getElementById('undo-btn');
  const restartBtn = document.getElementById('restart-btn');
  const newBtn = document.getElementById('new-btn');
  const roomInfoElem = document.getElementById('room-info');
  const roomCodeElem = document.getElementById('room-code');
  const roomStatusElem = document.getElementById('room-status');
  const copyRoomBtn = document.getElementById('copy-room');
  const cellElems = new Map();

  // ---------------------------------------------------------------------------
  // AI loading and invocation
  // ---------------------------------------------------------------------------
  async function loadAI() {
    if (aiReady) return;

    if (typeof loadPyodide !== "function") {
      console.error("Pyodide is not loaded. Add pyodide.js before script.js in index.html");
      alert("AI error: Pyodide is not loaded. Check index.html");
      return;
    }

    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"
    });

    await pyodide.runPythonAsync(`
  from pyodide.http import pyfetch
  import sys

  response = await pyfetch("ai_minimax.py?cache_bust=1")
  code = await response.string()

  with open("ai_minimax.py", "w", encoding="utf-8") as f:
      f.write(code)

  if "ai_minimax" in sys.modules:
      del sys.modules["ai_minimax"]

  import ai_minimax
  `);

    aiReady = true;
  }
  async function computeAIMove() {
    await loadAI();

    if (!pyodide) {
      throw new Error("Pyodide failed to load");
    }

    const boardObj = {};

    for (const [key, value] of boardState.entries()) {
      if (value !== "EMPTY") {
        boardObj[key] = value;
      }
    }

    const boardJson = JSON.stringify(boardObj);
    pyodide.globals.set("JS_BOARD_JSON", boardJson);

    const resultJson = await pyodide.runPythonAsync(`
  import json
  import ai_minimax

  board = json.loads(JS_BOARD_JSON)
  selection, dir_index = ai_minimax.get_best_move(board, "${aiColor}", 1)

  json.dumps({
      "selection": selection,
      "dirIndex": dir_index
  })
  `);

    const result = JSON.parse(resultJson);

    if (!result.selection || result.selection.length === 0) {
      throw new Error("AI returned no move");
    }

    return [result.selection, result.dirIndex];
  }
  async function triggerAIMove() {
    if (aiThinking || winner || gameMode !== 'AI' || currentPlayer !== aiColor) {
      return;
    }
    aiThinking = true;
    turnInfoElem.textContent = "AI is thinking...";
    try {
      const result = await computeAIMove();
      if (!result) {
        aiThinking = false;
        turnInfoElem.textContent = `Current turn: ${currentPlayer} (AI)`;
        return;
      }
      const [selKeys, dirIndex] = result;
      selected = selKeys.map((key) => {
        const parts = key.split(',');
        return { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
      });
      performMove(dirIndex);
    } catch (err) {
      console.error('Error executing AI move:', err);
    } finally {
      aiThinking = false;
      selected = [];
      updateBoardUI();
      updateInfoPanel();
    }
  }


  // ---------------------------------------------------------------------------
  // Online multiplayer helpers
  // ---------------------------------------------------------------------------
  function makeRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function setRoomStatus(text) {
    if (roomStatusElem) roomStatusElem.textContent = text;
  }

  function showRoomInfo(code) {
    if (!roomInfoElem || !roomCodeElem) return;
    roomInfoElem.style.display = 'block';
    roomCodeElem.textContent = code || '-';
  }

  function hideRoomInfo() {
    if (roomInfoElem) roomInfoElem.style.display = 'none';
  }

  function cleanupOnline() {
    onlineConnected = false;
    roomCode = null;
    localColor = null;
    if (connection) {
      try { connection.close(); } catch (e) { /* ignore */ }
    }
    if (peer) {
      try { peer.destroy(); } catch (e) { /* ignore */ }
    }
    connection = null;
    peer = null;
    hideRoomInfo();
  }

  function boardToObject(board) {
    const obj = {};
    for (const [key, value] of board.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  function objectToBoard(obj) {
    const map = new Map();
    for (const cell of BOARD_CELLS) {
      map.set(coordKey(cell), obj[coordKey(cell)] || 'EMPTY');
    }
    return map;
  }

  function sendFullState() {
    if (!connection || !onlineConnected) return;
    connection.send({
      type: 'state',
      payload: {
        board: boardToObject(boardState),
        currentPlayer,
        ejectedCounts,
        historyMoves,
        winner,
      },
    });
  }

  function loadFullState(payload) {
    if (!payload) return;
    boardState = objectToBoard(payload.board || {});
    currentPlayer = payload.currentPlayer || 'BLACK';
    ejectedCounts = payload.ejectedCounts || { BLACK: 0, WHITE: 0 };
    historyMoves = payload.historyMoves || [];
    winner = payload.winner || null;
    selected = [];
    history = [];
    updateBoardUI();
    updateInfoPanel();
  }

  function setupConnectionHandlers(conn) {
    connection = conn;

    connection.on('open', () => {
      onlineConnected = true;
      setRoomStatus(localColor === 'BLACK' ? 'Friend joined. You are BLACK.' : 'Connected. You are WHITE.');
      updateInfoPanel();
      if (localColor === 'WHITE') {
        connection.send({ type: 'request_state' });
      }
    });

    connection.on('data', (message) => {
      if (!message || typeof message !== 'object') return;

      if (message.type === 'move') {
        const remoteSelection = message.selection.map((key) => {
          const [q, r] = key.split(',').map(Number);
          return { q, r };
        });
        selected = remoteSelection;
        performMove(message.dirIndex, { remote: true });
      }

      if (message.type === 'restart') {
        resetGame({ silent: true });
      }

      if (message.type === 'request_state') {
        sendFullState();
      }

      if (message.type === 'state') {
        loadFullState(message.payload);
      }
    });

    connection.on('close', () => {
      onlineConnected = false;
      setRoomStatus('Connection closed.');
      updateInfoPanel();
    });

    connection.on('error', (err) => {
      console.error('Online connection error:', err);
      setRoomStatus('Connection error. Try creating a new room.');
    });
  }

  function createOnlineRoom() {
    cleanupOnline();
    gameMode = 'ONLINE';
    localColor = 'BLACK';
    roomCode = makeRoomCode();
    showRoomInfo(roomCode);
    setRoomStatus('Creating room... share this code with your friend.');

    peer = new Peer(`abalone-${roomCode}`);

    peer.on('open', () => {
      setRoomStatus('Room ready. Waiting for friend...');
      resetGame({ silent: true });
    });

    peer.on('connection', (conn) => {
      if (connection) {
        conn.close();
        return;
      }
      setupConnectionHandlers(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setRoomStatus('Could not create room. Try again.');
    });
  }

  function joinOnlineRoom(code) {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      alert('Enter a room code first.');
      return;
    }
    cleanupOnline();
    gameMode = 'ONLINE';
    localColor = 'WHITE';
    roomCode = cleanCode;
    showRoomInfo(roomCode);
    setRoomStatus('Joining room...');

    const peer = new Peer(undefined, {
      host: "0.peerjs.com",
      secure: true,
      port: 443
    });

    peer.on('open', () => {
      const conn = peer.connect(`abalone-${roomCode}`, { reliable: true });
      setupConnectionHandlers(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setRoomStatus('Could not join room. Check the code and try again.');
    });
  }

  function sendOnlineMove(selectionSnapshot, dirIndex) {
    if (gameMode !== 'ONLINE' || !connection || !onlineConnected) return;
    connection.send({
      type: 'move',
      selection: selectionSnapshot.map(coordKey),
      dirIndex,
    });
  }

  // ---------------------------------------------------------------------------
  // History and move helpers
  // ---------------------------------------------------------------------------
  function getMoveDirectionFromTarget(selection, targetCoord) {
    const allowed = getAllowedDirections(boardState, selection, currentPlayer);
    for (const dirIndex of allowed) {
      const dir = DIRECTIONS[dirIndex];
      const orientation = getOrientation(selection);
      const inline = selection.length > 1 && orientation !== undefined &&
        (dirIndex === orientation || dirIndex === (orientation + 3) % 6);
      if (selection.length === 1) {
        const dest = add(selection[0], dir);
        if (dest.q === targetCoord.q && dest.r === targetCoord.r) {
          return dirIndex;
        }
        continue;
      }
      if (!inline) {
        const matches = selection.some((cell) => {
          const dest = add(cell, dir);
          return dest.q === targetCoord.q && dest.r === targetCoord.r;
        });
        if (matches) return dirIndex;
        continue;
      }
      const sorted = [...selection].sort((a, b) => dot(b, dir) - dot(a, dir));
      const front = sorted[0];
      const frontTarget = add(front, dir);
      if (frontTarget.q === targetCoord.q && frontTarget.r === targetCoord.r) {
        return dirIndex;
      }
    }
    return null;
  }

  function saveHistorySnapshot() {
    history.push({
      board: cloneBoard(boardState),
      ejected: { ...ejectedCounts },
      player: currentPlayer,
    });
  }

  function appendMoveHistory(dirIndex, moveResult) {
    const dirNames = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
    const desc = `${currentPlayer} moved ${selected.length} marble${selected.length > 1 ? 's' : ''} ${dirNames[dirIndex]}`;
    const pushedCount = moveResult.ejected.BLACK + moveResult.ejected.WHITE;
    historyMoves.push(
      pushedCount > 0
        ? `${desc} and pushed ${pushedCount} marble${pushedCount > 1 ? 's' : ''} off`
        : desc
    );
  }

  function updateWinnerState() {
    if (ejectedCounts.WHITE >= 6) {
      winner = 'BLACK';
    } else if (ejectedCounts.BLACK >= 6) {
      winner = 'WHITE';
    } else {
      currentPlayer = currentPlayer === 'BLACK' ? 'WHITE' : 'BLACK';
    }
  }

  function performMove(dirIndex, options = {}) {
    if (winner) return;
    const allowed = getAllowedDirections(boardState, selected, currentPlayer);
    if (!allowed.includes(dirIndex)) return;
    const selectionSnapshot = selected.map((c) => ({ ...c }));
    saveHistorySnapshot();
    const result = applyMove(boardState, selected, dirIndex, currentPlayer);
    boardState = result.board;
    ejectedCounts.BLACK += result.ejected.BLACK;
    ejectedCounts.WHITE += result.ejected.WHITE;
    appendMoveHistory(dirIndex, result);
    selected = [];
    updateWinnerState();
    updateBoardUI();
    updateInfoPanel();
    updateArrowControls();
    if (gameMode === 'ONLINE' && !options.remote) {
      sendOnlineMove(selectionSnapshot, dirIndex);
    }
    if (!winner && gameMode === 'AI' && currentPlayer === aiColor && !aiThinking) {
      setTimeout(() => {
        triggerAIMove();
      }, 500);
    }
  }

  function handlePlayerSelection(coord) {
    const idx = selected.findIndex((c) => c.q === coord.q && c.r === coord.r);
    if (idx !== -1) {
      selected.splice(idx, 1);
      return;
    }
    const candidate = [...selected, coord];
    const unique = [];
    candidate.forEach((c) => {
      if (!unique.some((u) => u.q === c.q && u.r === c.r)) {
        unique.push(c);
      }
    });
    if (isValidSelection(boardState, unique, currentPlayer)) {
      selected = unique;
    } else {
      selected = [coord];
    }
  }

  function onCellClick(coord, occupant) {
    if (winner || aiThinking) return;
    if (gameMode === 'AI' && currentPlayer === aiColor) return;
    if (gameMode === 'ONLINE') {
      if (!onlineConnected || currentPlayer !== localColor) return;
    }
    if (occupant === currentPlayer) {
      handlePlayerSelection(coord);
      updateBoardUI();
      updateArrowControls();
      return;
    }
    if (selected.length > 0) {
      const dirIndex = getMoveDirectionFromTarget(selected, coord);
      if (dirIndex !== null) {
        performMove(dirIndex);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UI rendering
  // ---------------------------------------------------------------------------
  function clearCellClasses(cellDiv) {
    cellDiv.classList.remove('black', 'white', 'empty', 'selected', 'highlight');
  }

  function applyCellStateClass(cellDiv, state) {
    if (state === 'BLACK') {
      cellDiv.classList.add('black');
    } else if (state === 'WHITE') {
      cellDiv.classList.add('white');
    } else {
      cellDiv.classList.add('empty');
    }
  }

  function markSelectedCells() {
    selected.forEach((coord) => {
      const cell = cellElems.get(coordKey(coord));
      if (cell) {
        cell.classList.add('selected');
      }
    });
  }

  function highlightAvailableMoves() {
    if (selected.length === 0 || winner) return;
    if (gameMode === 'AI' && currentPlayer === aiColor) return;
    const allowed = getAllowedDirections(boardState, selected, currentPlayer);
    for (const dirIndex of allowed) {
      const dir = DIRECTIONS[dirIndex];
      const orientation = getOrientation(selected);
      const inline = selected.length > 1 && orientation !== undefined &&
        (dirIndex === orientation || dirIndex === (orientation + 3) % 6);
      if (selected.length === 1) {
        const dest = add(selected[0], dir);
        const cell = cellElems.get(coordKey(dest));
        if (cell) cell.classList.add('highlight');
        continue;
      }
      if (!inline) {
        selected.forEach((c) => {
          const dest = add(c, dir);
          const cell = cellElems.get(coordKey(dest));
          if (cell) cell.classList.add('highlight');
        });
      } else {
        const sorted = [...selected].sort((a, b) => dot(b, dir) - dot(a, dir));
        const front = sorted[0];
        const target = add(front, dir);
        const cell = cellElems.get(coordKey(target));
        if (cell) cell.classList.add('highlight');
      }
    }
  }

  function updateBoardUI() {
    for (const [key, cellDiv] of cellElems.entries()) {
      clearCellClasses(cellDiv);
      applyCellStateClass(cellDiv, boardState.get(key));
    }
    markSelectedCells();
    highlightAvailableMoves();
  }

  function buildBoard() {
    boardElem.innerHTML = '';
    cellElems.clear();
    const cellSize = 48;
    for (let r = -4; r <= 4; r++) {
      const qMin = Math.max(-4, -r - 4);
      const qMax = Math.min(4, -r + 4);
      const rowDiv = document.createElement('div');
      rowDiv.classList.add('row');
      rowDiv.style.marginLeft = `${Math.abs(r) * (cellSize / 2)}px`;
      for (let q = qMin; q <= qMax; q++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        const key = `${q},${r}`;
        cell.dataset.q = q;
        cell.dataset.r = r;
        cell.addEventListener('click', () => {
          onCellClick({ q, r }, boardState.get(key));
        });
        cellElems.set(key, cell);
        rowDiv.appendChild(cell);
      }
      boardElem.appendChild(rowDiv);
    }
  }

  function updateInfoPanel() {
    if (winner) {
      winnerElem.textContent = `${winner} wins!`;
    } else {
      winnerElem.textContent = '';
    }
    const isAiTurn = gameMode === 'AI' && currentPlayer === aiColor;
    const isOnline = gameMode === 'ONLINE';
    const onlineLabel = isOnline ? ` | You are ${localColor || '-'}${onlineConnected ? '' : ' | waiting'}` : '';
    turnInfoElem.textContent = winner ? '' : `Current turn: ${currentPlayer}${isAiTurn ? ' (AI)' : ''}${onlineLabel}`;
    ejectedBlackElem.textContent = ejectedCounts.BLACK;
    ejectedWhiteElem.textContent = ejectedCounts.WHITE;
    historyListElem.innerHTML = '';
    if (historyMoves.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No moves yet';
      li.style.color = '#718096';
      historyListElem.appendChild(li);
    } else {
      historyMoves.forEach((desc) => {
        const li = document.createElement('li');
        li.textContent = desc;
        historyListElem.appendChild(li);
      });
    }
    undoBtn.disabled = history.length === 0 || gameMode === 'ONLINE';
  }

  function updateArrowControls() {
    if (controlsElem) {
      controlsElem.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Game reset and control handlers
  // ---------------------------------------------------------------------------
  function handleUndo() {
    if (gameMode === 'ONLINE') return;
    if (history.length === 0 || aiThinking) return;
    // If playing against AI, undo two moves (AI move and player move)
    if (gameMode === 'AI' && history.length >= 2) {
      history.pop(); // Remove AI move
      const last = history.pop(); // Remove player move
      boardState = cloneBoard(last.board);
      ejectedCounts = { ...last.ejected };
      currentPlayer = last.player;
      historyMoves.pop(); // Remove AI move from history
      historyMoves.pop(); // Remove player move from history
    } else {
      const last = history.pop();
      boardState = cloneBoard(last.board);
      ejectedCounts = { ...last.ejected };
      currentPlayer = last.player;
      historyMoves.pop();
    }
    selected = [];
    winner = null;
    updateBoardUI();
    updateInfoPanel();
    updateArrowControls();
  }

  function resetGame(options = {}) {
    boardState = initialBoard();
    currentPlayer = 'BLACK';
    selected = [];
    ejectedCounts = { BLACK: 0, WHITE: 0 };
    history = [];
    historyMoves = [];
    winner = null;
    updateBoardUI();
    updateInfoPanel();
    updateArrowControls();
    if (gameMode === 'ONLINE' && !options.silent && connection && onlineConnected) {
      connection.send({ type: 'restart' });
    }
    if (gameMode === 'AI' && currentPlayer === aiColor && !aiThinking) {
      setTimeout(() => {
        triggerAIMove();
      }, 500);
    }
  }

  function handleRestart() {
    resetGame();
  }

  function handleNew() {
    cleanupOnline();
    gameMode = 'LOCAL';
    resetGame({ silent: true });
    const startScreen = document.getElementById('start-screen');
    const appContainer = document.getElementById('app-container');
    const humanMenu = document.getElementById('human-menu');
    if (humanMenu) humanMenu.style.display = 'none';
    if (appContainer) appContainer.style.display = 'none';
    if (startScreen) startScreen.style.display = 'flex';
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    buildBoard();
    updateBoardUI();
    updateInfoPanel();
    updateArrowControls();
    hideRoomInfo();

    const startScreen = document.getElementById('start-screen');
    const appContainer = document.getElementById('app-container');
    const startHumanBtn = document.getElementById('start-human');
    const startAiBtn = document.getElementById('start-ai');
    const humanMenu = document.getElementById('human-menu');
    const startLocalBtn = document.getElementById('start-local');
    const createRoomBtn = document.getElementById('create-room');
    const joinRoomBtn = document.getElementById('join-room');
    const joinCodeInput = document.getElementById('join-code');
    const backModeBtn = document.getElementById('back-mode');

    function openGame() {
      if (startScreen) startScreen.style.display = 'none';
      if (appContainer) appContainer.style.display = '';
      updateBoardUI();
      updateInfoPanel();
    }

    if (startHumanBtn) {
      startHumanBtn.addEventListener('click', () => {
        if (humanMenu) humanMenu.style.display = 'block';
      });
    }

    if (startLocalBtn) {
      startLocalBtn.addEventListener('click', () => {
        cleanupOnline();
        gameMode = 'LOCAL';
        openGame();
        resetGame({ silent: true });
      });
    }

    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        openGame();
        createOnlineRoom();
      });
    }

    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => {
        openGame();
        joinOnlineRoom(joinCodeInput ? joinCodeInput.value : '');
      });
    }

    if (joinCodeInput) {
      joinCodeInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
          openGame();
          joinOnlineRoom(joinCodeInput.value);
        }
      });
    }

    if (backModeBtn) {
      backModeBtn.addEventListener('click', () => {
        if (humanMenu) humanMenu.style.display = 'none';
      });
    }

    if (copyRoomBtn) {
      copyRoomBtn.addEventListener('click', async () => {
        if (!roomCode) return;
        try {
          await navigator.clipboard.writeText(roomCode);
          setRoomStatus('Room code copied. Share it with your friend.');
        } catch (err) {
          setRoomStatus('Copy failed. Select the code manually.');
        }
      });
    }

    if (startAiBtn) {
      startAiBtn.addEventListener('click', () => {
        cleanupOnline();
        gameMode = 'AI';
        openGame();
        loadAI();
        resetGame({ silent: true });
      });
    }
  });

  undoBtn.addEventListener('click', handleUndo);
  restartBtn.addEventListener('click', handleRestart);
  newBtn.addEventListener('click', handleNew);
})();