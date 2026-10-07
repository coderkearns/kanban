// Backend: reads/writes JSON files in ~/.kanban. No app logic lives here.
//   kanban.json    { version, boards: [id, …] } + future settings
//   <id>.json      one board: { name, columns, cards }

const SEED = {
  kanban: { version: 1, boards: ['schoolwork'] },
  schoolwork: {
    name: 'Schoolwork',
    columns: [
      { id: 'todo', name: 'Not started' },
      { id: 'doing', name: 'In progress' },
      { id: 'waiting', name: 'Waiting' },
      { id: 'done', name: 'Done', clearable: true },
    ],
    cards: [],
  },
};

const NAME = /^[a-z0-9-]+$/;
const dir = (app) => app.paths.home + '/.kanban';
const dec = new TextDecoder();

async function read(path) {
  try {
    return JSON.parse(dec.decode(await tjs.readFile(path)));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`${path}: ${e.message}`); // corrupt file: surface it, never overwrite with seed
  }
}

async function write(path, data) {
  await tjs.writeFile(path + '.tmp', JSON.stringify(data, null, 2));
  try { await tjs.copyFile(path, path + '.bak'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await tjs.rename(path + '.tmp', path); // atomic: a crash leaves the old file intact
}

export const api = {
  async load(_, app) {
    const d = dir(app);
    let config = await read(d + '/kanban.json');
    if (!config) {
      await tjs.makeDir(d, { recursive: true });
      for (const [name, data] of Object.entries(SEED)) await write(`${d}/${name}.json`, data);
      config = SEED.kanban;
    }
    const boards = {};
    for (const id of config.boards) {
      if (!NAME.test(id)) throw new Error(`bad board id in kanban.json: ${id}`);
      boards[id] = await read(`${d}/${id}.json`);
      if (!boards[id]) throw new Error(`kanban.json lists "${id}" but ${d}/${id}.json is missing`);
    }
    return { config, boards };
  },

  async save({ name, data }, app) {
    if (!NAME.test(name)) throw new Error(`bad file name: ${name}`); // page must not escape ~/.kanban
    await write(`${dir(app)}/${name}.json`, data);
  },
};
