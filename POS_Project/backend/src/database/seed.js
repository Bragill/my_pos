require("dotenv").config();
const db = require("./dbHelper");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

async function seed() {
  console.log("Seeding Cloudflare D1 database...");

  const adminRoleId = uuidv4();
  const managerRoleId = uuidv4();
  const cashierRoleId = uuidv4();
  await db.run("INSERT OR IGNORE INTO roles (id,name,permissions) VALUES (?,?,?)", [adminRoleId, "admin", '{"all":true}']);
  await db.run("INSERT OR IGNORE INTO roles (id,name,permissions) VALUES (?,?,?)", [managerRoleId, "manager", '{"reports":true,"inventory":true}']);
  await db.run("INSERT OR IGNORE INTO roles (id,name,permissions) VALUES (?,?,?)", [cashierRoleId, "cashier", '{"pos":true,"shift":true}']);

  const adminRole = await db.get("SELECT id FROM roles WHERE name='admin'");
  const actualAdminRoleId = adminRole.id;

  const hash = await bcrypt.hash("admin1234", 12);
  const adminPin = await bcrypt.hash("0000", 10);
  await db.run("INSERT OR IGNORE INTO users (id,username,password_hash,pin_code,full_name,role_id) VALUES (?,?,?,?,?,?)", [uuidv4(), "admin", hash, adminPin, "Admin", actualAdminRoleId]);

  const cats = ["เครื่องดื่ม","อาหาร","ขนม","วัตถุดิบ","อุปกรณ์","อื่นๆ"];
  for (const c of cats) { await db.run("INSERT OR IGNORE INTO categories (id,name,store_id) VALUES (?,?,'store-1')", [uuidv4(), c]); }

  const catRows = await db.all("SELECT id,name FROM categories");
  const catMap = {};
  catRows.forEach(r => catMap[r.name] = r.id);

  const products = [
    ["BEV001","8850999220017","น้ำดื่ม 600ml","เครื่องดื่ม",5,10,100,1],
    ["BEV002","8850999220024","โคล่า 325ml","เครื่องดื่ม",10,18,80,1],
    ["BEV003","8850999220031","ชาเขียว 500ml","เครื่องดื่ม",12,20,60,1],
    ["FOD001","8850999330017","บะหมี่กึ่งสำเร็จรูป","อาหาร",5,8,200,0],
    ["FOD002","8850999330024","โจ๊กถ้วย","อาหาร",15,25,50,0],
    ["SNK001","8850999440017","มันฝรั่งทอด","ขนม",15,25,40,1],
    ["SNK002","8850999440024","ช็อคโกแลตบาร์","ขนม",20,35,30,0],
    ["SNK003","8850999440031","คุกกี้แพ็ค","ขนม",18,30,45,0],
    ["SUP001","8850999550017","กระดาษทิชชู่","อุปกรณ์",8,15,100,0],
    ["SUP002","8850999550024","เจลล้างมือ","อุปกรณ์",25,45,30,0],
  ];

  for (const p of products) {
    const pid = uuidv4();
    await db.run("INSERT OR IGNORE INTO products (id,sku,barcode,name,category_id,cost_price,selling_price,is_featured,store_id) VALUES (?,?,?,?,?,?,?,?,'store-1')", [pid, p[0], p[1], p[2], catMap[p[3]]||null, p[4], p[5], p[7]]);
    await db.run("INSERT OR IGNORE INTO inventory (product_id,quantity,reorder_level,store_id) VALUES (?,?,?, 'store-1')", [pid, p[6], 10]);
  }

  await db.run("INSERT OR IGNORE INTO stores (id, name, vat_rate) VALUES ('store-1', 'My POS Store', 7.0)");
  await db.run("INSERT OR IGNORE INTO store_settings (id,store_name,address,vat_rate,receipt_header,receipt_footer) VALUES (?,?,?,?,?,?)", [uuidv4(), "My POS Store", "123 Bangkok Thailand", 7.00, "Thank you!", "No refund"]);
  await db.run("INSERT OR IGNORE INTO customers (id,member_code,name,phone,email,points,store_id) VALUES (?,?,?,?,?,?,'store-1')", [uuidv4(), "MBR-0001", "John Smith", "081-234-5678", "john@example.com", 150]);
  await db.run("INSERT OR IGNORE INTO customers (id,member_code,name,phone,email,points,store_id) VALUES (?,?,?,?,?,?,'store-1')", [uuidv4(), "MBR-0002", "Jane Doe", "089-876-5432", "jane@example.com", 80]);

  console.log("Seed completed on D1! Admin: admin / admin1234 (PIN: 0000)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
