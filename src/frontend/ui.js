// Rendering + interaction. Reads/changes `state` only through data.js helpers.

const $ = (sel, el = document) => el.querySelector(sel);
const tpl = (id) => document.getElementById(id).content.firstElementChild;
const main = $('main'), search = $('body > header input'), dialog = $('dialog'), form = $('form');

let boardId;
const board = () => state.boards[boardId];
const sections = new Map(); // column id -> <section>
const sticky = {};          // "board/column" -> last subtitle typed in quick-add
let editing = null;         // { id } when editing, { column } when creating

// Apply a data.js helper to the current board, re-render what it touched, save.
function change(fn) {
  fn(board()).forEach(renderColumn);
  save(boardId);
}

// ---- render ---------------------------------------------------------------

function showBoard(id) {
  boardId = id;
  $('h1').textContent = board().name;
  const nav = $('nav');
  nav.hidden = state.config.boards.length < 2;
  nav.replaceChildren(...state.config.boards.map((b, i) => {
    const btn = document.createElement('button');
    btn.textContent = state.boards[b].name;
    btn.title = 'Ctrl ' + (i + 1);
    btn.onclick = () => showBoard(b);
    if (b === id) btn.setAttribute('aria-current', 'page');
    return btn;
  }));

  sections.clear();
  main.replaceChildren(...board().columns.map((col) => {
    const s = tpl('column').cloneNode(true);
    s.dataset.col = col.id;
    s.toggleAttribute('data-clearable', !!col.clearable);
    $('h2', s).textContent = col.name;
    $('button', s).hidden = !col.clearable;
    sections.set(col.id, s);
    return s;
  }));
  renderAll();
}

function renderAll() {
  sections.forEach((_, id) => renderColumn(id));
}

function renderColumn(colId) {
  const s = sections.get(colId);
  if (!s) return;
  const col = board().columns.find((c) => c.id === colId);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const q = search.value.trim().toLowerCase();
  const cards = board().cards.filter((c) => c.column === colId);
  const shown = q ? cards.filter((c) => [c.subtitle, c.title, c.notes].join(' ').toLowerCase().includes(q)) : cards;
  $('output', s).textContent = cards.length;
  $('ol', s).replaceChildren(...shown.map((c) => cardEl(c, today, col.clearable)));
}

function cardEl(card, today, done) {
  const li = tpl('card').cloneNode(true);
  li.dataset.id = card.id;
  const small = $('small', li), time = $('time', li), link = $('a', li), dots = $('span', li);
  small.textContent = card.subtitle || '';
  small.hidden = !card.subtitle;
  $('h3', li).textContent = card.title;
  time.hidden = !card.due;
  if (card.due) {
    const { label, state } = dueInfo(card.due, today);
    time.textContent = label;
    time.dateTime = card.due;
    if (state && !done) $('article', li).dataset.due = state; // done cards are never late
  }
  link.hidden = !card.link;
  if (card.link) link.href = card.link;
  $('[data-notes]', li).toggleAttribute('hidden', !card.notes); // SVG has no .hidden property
  dots.textContent = card.difficulty ? '●'.repeat(card.difficulty) + '○'.repeat(3 - card.difficulty) : '';
  $('footer', li).hidden = !(card.due || card.link || card.notes || card.difficulty);
  return li;
}

// ---- editor ---------------------------------------------------------------

function openEditor(target, fields = {}) {
  editing = target;
  form.reset();
  for (const [k, v] of Object.entries(fields)) if (form.elements[k]) form.elements[k].value = v;
  $('button[value="delete"]', form).hidden = !target.id;
  dialog.returnValue = '';
  dialog.showModal();
  form.elements[fields.subtitle ? 'title' : 'subtitle'].focus();
}

dialog.addEventListener('close', () => {
  const action = dialog.returnValue;
  const fields = Object.fromEntries(new FormData(form));
  fields.difficulty = Number(fields.difficulty) || null;
  if (action === 'save' && editing.id) change((b) => updateCard(b, editing.id, fields));
  if (action === 'save' && !editing.id) change((b) => addCard(b, { column: editing.column, ...fields }));
  if (action === 'delete') change((b) => deleteCard(b, editing.id));
  editing = null;
});

main.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (a) { // never navigate the app window; hand links to the OS browser
    e.preventDefault();
    tiny.app.shell.open(a.href);
    return;
  }
  if (e.target.closest('section > header button')) {
    change((b) => clearColumn(b, e.target.closest('section').dataset.col));
    return;
  }
  const li = e.target.closest('li[data-id]');
  if (li) openEditor({ id: li.dataset.id }, board().cards.find((c) => c.id === li.dataset.id));
});

// ---- quick add ------------------------------------------------------------

// "HIST 201: Reading 4" -> subtitle + title; no prefix -> reuse the column's last subtitle.
function parse(line, colId) {
  const key = boardId + '/' + colId;
  const m = line.match(/^([^:]{1,30}):\s*(.+)$/);
  if (m) sticky[key] = m[1].trim();
  return { subtitle: sticky[key] || '', title: (m ? m[2] : line).trim() };
}

main.addEventListener('keydown', (e) => {
  const input = e.target.closest('section > input');
  if (!input || e.key !== 'Enter' || e.isComposing || !input.value.trim()) return;
  const column = input.closest('section').dataset.col;
  const fields = parse(input.value, column);
  input.value = '';
  if (e.shiftKey) openEditor({ column }, fields);
  else change((b) => addCard(b, { column, ...fields }));
});

main.addEventListener('paste', (e) => {
  const input = e.target.closest('section > input');
  const text = e.clipboardData.getData('text');
  if (!input || !text.includes('\n')) return;
  e.preventDefault();
  const column = input.closest('section').dataset.col;
  const lines = text.split('\n').filter((l) => l.trim());
  change((b) => lines.flatMap((l) => addCard(b, { column, ...parse(l, column) })));
});

// ---- drag and drop --------------------------------------------------------
// Only a marker moves while dragging; the data changes once, on drop.

const marker = document.createElement('li');
marker.dataset.drop = '';
let dragged = null;

// WebKitGTK draws the native drag image at the wrong scale (huge), so on Linux
// hide it and move a clone of the card with the pointer instead.
const linux = navigator.userAgent.includes('Linux');
const blank = new Image();
blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let ghost = null, grab;
const moveGhost = (e) => ghost && (ghost.style.translate = `${e.clientX - grab[0]}px ${e.clientY - grab[1]}px`);
document.addEventListener('dragover', moveGhost);

main.addEventListener('dragstart', (e) => {
  dragged = e.target.closest('li[data-id]');
  if (!dragged) return;
  e.dataTransfer.setData('text/plain', dragged.dataset.id); // WebKitGTK needs data set to start a drag
  e.dataTransfer.effectAllowed = 'move';
  if (linux) {
    const card = $('article', dragged), r = card.getBoundingClientRect();
    e.dataTransfer.setDragImage(blank, 0, 0);
    grab = [e.clientX - r.left, e.clientY - r.top];
    ghost = card.cloneNode(true);
    ghost.dataset.ghost = '';
    ghost.style.width = r.width + 'px';
    document.body.append(ghost);
    moveGhost(e);
  }
  requestAnimationFrame(() => dragged?.setAttribute('data-dragging', ''));
});

main.addEventListener('dragover', (e) => {
  const section = dragged && e.target.closest('section');
  if (!section) return;
  const ol = $('ol', section);
  e.preventDefault();
  const before = [...ol.children].find((li) => li !== marker && li.getBoundingClientRect().top + li.offsetHeight / 2 > e.clientY) || null;
  if (marker.parentNode !== ol || marker.nextSibling !== before) ol.insertBefore(marker, before);
});

main.addEventListener('drop', (e) => {
  if (!dragged || !marker.parentNode) return;
  e.preventDefault();
  let next = marker.nextElementSibling;
  if (next === dragged) next = next.nextElementSibling;
  const column = marker.closest('section').dataset.col;
  const id = dragged.dataset.id;
  endDrag(); // the re-render detaches the dragged card, so its dragend never reaches main
  change((b) => moveCard(b, id, column, next?.dataset.id || null));
});

function endDrag() {
  marker.remove();
  dragged?.removeAttribute('data-dragging');
  dragged = null;
  ghost?.remove();
  ghost = null;
}
main.addEventListener('dragend', endDrag);

// ---- search + shortcuts (Ctrl on Linux, ⌘ on macOS) -----------------------

search.addEventListener('input', renderAll);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { search.value = ''; renderAll(); search.blur(); }
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const boardN = state.config.boards[e.key - 1];
  if (e.key === 'Enter' && dialog.open) form.requestSubmit($('button[value="save"]', form));
  else if ($('dialog[open]')) return;
  else if (e.key === 'n') openEditor({ column: board().columns[0].id });
  else if (e.key === '/') search.select();
  else if (e.key === ',') openSettings();
  else if (/^[1-9]$/.test(e.key) && boardN) showBoard(boardN);
  else return;
  e.preventDefault();
});

// ---- settings -------------------------------------------------------------
// Stored in kanban.json alongside the board list.

const settings = $('#settings'), zoom = $('select', settings);

function openSettings() {
  zoom.value = state.config.zoom || 1;
  settings.showModal();
}

zoom.addEventListener('change', () => {
  state.config.zoom = Number(zoom.value);
  tiny.win.setZoom(state.config.zoom);
  save('kanban');
});
$('body > header > button').addEventListener('click', openSettings);

// ---- boot -----------------------------------------------------------------

// Relative dates go stale at midnight (and after sleeping through it).
function scheduleMidnight() {
  const next = new Date(); next.setHours(24, 0, 1, 0);
  setTimeout(() => { renderAll(); scheduleMidnight(); }, next - Date.now());
}
tiny.api.on('wake', renderAll);

tiny.win.setMinSize(640, 420);
loadAll()
  .then(() => { tiny.win.setZoom(state.config.zoom || 1); showBoard(state.config.boards[0]); scheduleMidnight(); })
  .catch((e) => {
    const p = document.createElement('p');
    p.textContent = 'Could not load boards:\n' + (e.message || e);
    main.replaceChildren(p);
  });