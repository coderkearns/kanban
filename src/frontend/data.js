// State + persistence. The only file that talks to the backend.
// Card helpers mutate a board in place and return the column ids they touched.

const state = { config: null, boards: {} };
const timers = {};

async function loadAll() {
  Object.assign(state, await tiny.api.call('load'));
}

// Debounced per file: a burst of edits becomes one write of one board.
function save(name) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => flush(name), 400);
}

function flush(name) {
  clearTimeout(timers[name]);
  delete timers[name];
  const data = name === 'kanban' ? state.config : state.boards[name];
  return tiny.api.call('save', { name, data })
    .catch((e) => tiny.dialog.alert('Could not save ' + name, String(e)));
}

// ponytail: best-effort flush on close; worst case loses the last 400ms of edits.
addEventListener('beforeunload', () => Object.keys(timers).forEach(flush));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Drop empty fields so the JSON stays tidy and old/new cards look alike.
function clean(fields) {
  for (const k in fields) if (fields[k] === '' || fields[k] == null) delete fields[k];
  return fields;
}

// Index in board.cards where a card lands when inserted before `beforeId`,
// or at the end of `column` when beforeId is null.
function slot(cards, column, beforeId) {
  if (beforeId) return cards.findIndex((c) => c.id === beforeId);
  const last = cards.findLastIndex((c) => c.column === column);
  return last < 0 ? cards.length : last + 1;
}

// New cards go before the first card due later (undated cards count as latest).
// Existing cards are never re-sorted, so manual order sticks.
function addCard(board, fields) {
  const card = clean({ id: uid(), ...fields });
  const next = card.due && board.cards.find((c) => c.column === card.column && (!c.due || c.due > card.due));
  board.cards.splice(slot(board.cards, card.column, next?.id), 0, card);
  return [card.column];
}

function updateCard(board, id, fields) {
  const card = board.cards.find((c) => c.id === id);
  for (const k of ['subtitle', 'title', 'due', 'link', 'notes', 'difficulty']) delete card[k];
  Object.assign(card, clean(fields));
  return [card.column];
}

function moveCard(board, id, column, beforeId) {
  const i = board.cards.findIndex((c) => c.id === id);
  const [card] = board.cards.splice(i, 1);
  const from = card.column;
  card.column = column;
  board.cards.splice(slot(board.cards, column, beforeId), 0, card);
  return [from, column];
}

function deleteCard(board, id) {
  const i = board.cards.findIndex((c) => c.id === id);
  return [board.cards.splice(i, 1)[0].column];
}

function clearColumn(board, column) {
  board.cards = board.cards.filter((c) => c.column !== column);
  return [column];
}
