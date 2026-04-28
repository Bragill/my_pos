const Database = require("better-sqlite3");
const db = new Database(":memory:");

db.exec("CREATE TABLE test (id TEXT)");
db.prepare("INSERT INTO test (id) VALUES (?)").run("1");

try {
  const row = db.prepare("SELECT * FROM test WHERE id = ?").get(undefined);
  console.log("Result with undefined:", row);
} catch (err) {
  console.error("Error with undefined:", err.message);
}

try {
  const row = db.prepare("SELECT * FROM test WHERE id = ?").get([undefined]);
  console.log("Result with [undefined]:", row);
} catch (err) {
  console.error("Error with [undefined]:", err.message);
}
