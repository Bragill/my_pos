const { getDb, saveDb } = require("./connection");

let _db = null;

async function init() {
  _db = await getDb();
}

function get(sql, params = []) {
  try {
    return _db.prepare(sql).get(params);
  } catch (err) {
    console.error("Database Get Error:", err, { sql, params });
    throw err;
  }
}

function all(sql, params = []) {
  try {
    return _db.prepare(sql).all(params);
  } catch (err) {
    console.error("Database All Error:", err, { sql, params });
    throw err;
  }
}

function run(sql, params = []) {
  try {
    const info = _db.prepare(sql).run(params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  } catch (err) {
    console.error("Database Run Error:", err, { sql, params });
    throw err;
  }
}

function getDatabase() { return _db; }

module.exports = { init, get, all, run, getDatabase, saveDb };