-- POS Data Migration Dump
PRAGMA foreign_keys = OFF;

-- Data for roles -> roles
INSERT OR IGNORE INTO roles (id, name, permissions, created_at, updated_at) VALUES
('64602c12-70bb-4a10-b6b3-fcaa087600d3', 'admin', '{"all":true}', '2026-04-16 08:03:26', '2026-04-16 08:03:26'),
('42b3af75-f73e-4812-b7db-9b6ffb33542e', 'manager', '{"reports":true,"inventory":true}', '2026-04-16 08:03:26', '2026-04-16 08:03:26'),
('06e64f01-52ed-41b7-8e22-2a5e26f039b3', 'cashier', '{"pos":true,"shift":true}', '2026-04-16 08:03:26', '2026-04-16 08:03:26');

-- Data for stores -> stores
INSERT OR IGNORE INTO stores (id, name, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url, is_active, created_at, updated_at, promptpay_number, promptpay_name) VALUES
('store-1', 'My POS Store', '123 Bangkok Thailand', NULL, NULL, 0, 'Thank you!', 'No refund', NULL, 1, '2026-04-18 15:09:54', '2026-04-18 15:09:54', NULL, NULL),
('b9c939e2-de41-4c27-bea2-99ad070f3bbc', 'ร้านหมูปิ้ง', '195/70 Villa Forest ต.บ้านบึง อ.บ้านบึง จ.ชลบุรี 20170', '0943439695', '123456789', 0, NULL, NULL, NULL, 1, '2026-04-19 12:55:31', '2026-04-19 15:12:50', '0943439695', 'น.ส. รุจิรา คัพภะเจริญ');

-- Data for store_settings -> stores
INSERT OR IGNORE INTO stores (id, address, phone, tax_id, vat_rate, receipt_header, receipt_footer, logo_url, updated_at, name) VALUES
('e9044a01-8c0d-4b72-998b-10e43dbe7c56', '123 Bangkok Thailand', NULL, NULL, 0, 'Thank you!', 'No refund', NULL, '2026-04-17 05:40:01', 'My POS Store'),
('b1bc0f07-1ae3-4539-9742-348c243f2f7f', '123 Bangkok Thailand', NULL, NULL, 7, 'Thank you!', 'No refund', NULL, '2026-04-19 10:25:30', 'My POS Store');

-- Data for categories -> categories
INSERT OR IGNORE INTO categories (id, name, description, sort_order, is_active, created_at, updated_at, store_id) VALUES
('9785a98f-ded8-48b1-94f6-2ef4e3439125', 'เครื่องดื่ม', NULL, 0, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('adbafe7a-cbba-4d61-aeb3-e89db3d5edba', 'อาหาร', NULL, 0, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('f298b399-fe7e-4949-91ea-dcd04f55e16d', 'ขนม', NULL, 0, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('7e440114-c93c-4866-b526-b073e6e60f85', 'อุปกรณ์', NULL, 0, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('e5c0ad4e-b14e-46bb-9231-8a9c91aca2a6', 'อื่นๆ', NULL, 0, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('3286d2e7-d877-4db3-8cbd-64cb04c765da', 'เครื่องดื่ม', NULL, 0, 1, '2026-04-19 10:25:30', '2026-04-19 10:25:30', NULL),
('79c7ca01-104e-47f6-8c96-1175dc337d52', 'อาหาร', NULL, 0, 1, '2026-04-19 10:25:30', '2026-04-19 10:25:30', NULL),
('591a0722-16b6-4fa7-a483-3dca95717d93', 'ขนม', NULL, 0, 1, '2026-04-19 10:25:30', '2026-04-19 10:25:30', NULL),
('cf73f3b4-d7c6-4881-9100-585789cf31b4', 'อุปกรณ์', NULL, 0, 1, '2026-04-19 10:25:30', '2026-04-19 10:25:30', NULL),
('9738d491-61c1-4964-b263-acaebabc36dd', 'อื่นๆ', NULL, 0, 1, '2026-04-19 10:25:30', '2026-04-19 10:25:30', NULL);

-- Data for users -> users
INSERT OR IGNORE INTO users (id, username, password_hash, pin_code, full_name, role_id, status, created_at, updated_at) VALUES
('e6375492-0fc9-400c-9144-8e583f64261f', 'admin', '$2a$12$2cIIsTUQra21OTCk7Y.M5.FSVVq/Byw9.3tR2BfipZQUp7xrGuq0u', '$2a$12$byvVrMvlObwa06tI1AshxOXQzSpS0Ou30Ypykiypf3dQ8gx4BNo8C', 'Admin', '64602c12-70bb-4a10-b6b3-fcaa087600d3', 'active', '2026-04-16 08:03:26', '2026-04-16 08:03:26'),
('112a5c70-8033-44d4-ac19-92ca25c14025', 'manager', '$2a$12$dDa2UCuu7WACReAVyL5kmOvajEaIipTw6FzeXSmQ7mQM9c8s.h4Q2', '$2a$12$.EPg1PxxsbWnxv1iYAOJm.Wbd0tZhcuA2jMAb319tkr6IQ7Xp8UMq', 'manager', '42b3af75-f73e-4812-b7db-9b6ffb33542e', 'active', '2026-04-17 09:20:48', '2026-04-17 09:20:48'),
('ddf8d68d-5aa8-47bf-a6d2-15819749f54a', 'user', '$2a$12$2xZI7I1.tkSXiaQLfOfjOO7HDC3uFZCD0e0syqnrsvamPO.vqg91y', '$2a$12$VdbmpNAJRjkWEYeMGTS.d.XAoZXSmEZQW/rfWJ0sb1Aml44dnBOHO', 'user', '06e64f01-52ed-41b7-8e22-2a5e26f039b3', 'active', '2026-04-17 09:21:35', '2026-04-17 09:21:35');

-- Data for customers -> customers
INSERT OR IGNORE INTO customers (id, member_code, name, phone, email, points, created_at, updated_at, store_id) VALUES
('87617132-7e67-4112-823d-c7700f2782b0', 'MBR-0001', 'John Smith', '081-234-5678', 'john@example.com', 150, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('43a7bc69-2178-42fa-ba04-6d9c155ace00', 'MBR-0002', 'Jane Doe', '089-876-5432', 'jane@example.com', 80, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1');

-- Data for debtors -> debtors
INSERT OR IGNORE INTO debtors (id, name, phone, note, created_at, updated_at, store_id) VALUES
('1a3df764-fe8b-414e-8f22-8060dc452529', 'Test', NULL, NULL, '2026-04-17 06:14:58', '2026-04-17 06:14:58', 'store-1'),
('3e1374a6-d0a0-4865-bc39-93e5fadb098e', 'Test', NULL, NULL, '2026-04-19 15:56:01', '2026-04-19 15:56:01', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc');

-- Data for products -> products
INSERT OR IGNORE INTO products (id, sku, barcode, name, description, category_id, cost_price, selling_price, image_url, is_active, is_featured, created_at, updated_at, store_id) VALUES
('409abacc-a31d-44d0-be90-7b0eeb9c3654', 'BEV001', '8850999220017', 'น้ำดื่ม 600ml', NULL, '9785a98f-ded8-48b1-94f6-2ef4e3439125', 5, 10, NULL, 1, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('41d3d63a-0063-457d-a75d-a273df326363', 'BEV002', '8850999220024', 'โคล่า 325ml', NULL, '9785a98f-ded8-48b1-94f6-2ef4e3439125', 10, 18, NULL, 1, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('2dfe62bf-5344-4807-bc21-a67f9f46fbd4', 'BEV003', '8850999220031', 'ชาเขียว 500ml', '', '9785a98f-ded8-48b1-94f6-2ef4e3439125', 12, 20, '', 1, 0, '2026-04-16 08:03:26', '2026-04-17 08:23:20', 'store-1'),
('a6ede3b0-af89-4f74-b4e8-65d22c622bd6', 'FOD001', '8850999330017', 'บะหมี่กึ่งสำเร็จรูป', NULL, 'adbafe7a-cbba-4d61-aeb3-e89db3d5edba', 5, 8, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('90c17c86-cbeb-4f0e-b6d4-4b97b52b02af', 'FOD002', '8850999330024', 'โจ๊กถ้วย', NULL, 'adbafe7a-cbba-4d61-aeb3-e89db3d5edba', 15, 25, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('eaec506b-2f31-4c8c-b673-7417e5774f09', 'SNK001', '8850999440017', 'มันฝรั่งทอด', NULL, 'f298b399-fe7e-4949-91ea-dcd04f55e16d', 15, 25, NULL, 1, 1, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('a29e0af4-f195-44ed-b41c-cf401a778755', 'SNK002', '8850999440024', 'ช็อคโกแลตบาร์', NULL, 'f298b399-fe7e-4949-91ea-dcd04f55e16d', 20, 35, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('6f9cae7a-9001-4fb1-b6d4-b9ad5ec08737', 'SNK003', '8850999440031', 'คุกกี้แพ็ค', NULL, 'f298b399-fe7e-4949-91ea-dcd04f55e16d', 18, 30, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('bd300935-f4ad-4ef9-8cda-7d5fef84cdb0', 'SUP001', '8850999550017', 'กระดาษทิชชู่', NULL, '7e440114-c93c-4866-b526-b073e6e60f85', 8, 15, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('442cf449-86f5-41f1-a70f-3c2182663083', 'SUP002', '8850999550024', 'เจลล้างมือ', NULL, '7e440114-c93c-4866-b526-b073e6e60f85', 25, 45, NULL, 1, 0, '2026-04-16 08:03:26', '2026-04-16 08:03:26', 'store-1'),
('1def8660-4563-4d58-b8ea-fda1ed818660', 'PRD122797', NULL, 'Test', NULL, 'e5c0ad4e-b14e-46bb-9231-8a9c91aca2a6', 10, 5, NULL, 0, 0, '2026-04-17 09:09:28', '2026-04-17 09:15:08', 'store-1'),
('f067ec66-feec-4957-8353-f3337a49f373', 'PRD178173', '6911316002258', 'เยลลี่', NULL, 'adbafe7a-cbba-4d61-aeb3-e89db3d5edba', 3, 5, NULL, 1, 0, '2026-04-18 08:30:17', '2026-04-18 08:30:17', 'store-1'),
('19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 'PRD704377', NULL, 'หมูปิ้ง', NULL, NULL, 3, 5, NULL, 1, 1, '2026-04-19 12:57:38', '2026-04-19 12:57:38', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'PRD463926', '8852364008589', 'ข้าวเหนียว', '', '', 1, 5, '', 1, 0, '2026-04-19 13:35:03', '2026-04-19 13:36:18', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc');

-- Data for inventory -> inventory
INSERT OR IGNORE INTO inventory (product_id, quantity, reorder_level, updated_at, store_id) VALUES
('409abacc-a31d-44d0-be90-7b0eeb9c3654', 98, 10, '2026-04-17 14:52:21', 'store-1'),
('41d3d63a-0063-457d-a75d-a273df326363', 78, 10, '2026-04-17 10:01:44', 'store-1'),
('2dfe62bf-5344-4807-bc21-a67f9f46fbd4', 60, 10, '2026-04-16 08:03:26', 'store-1'),
('a6ede3b0-af89-4f74-b4e8-65d22c622bd6', 200, 10, '2026-04-16 08:03:26', 'store-1'),
('90c17c86-cbeb-4f0e-b6d4-4b97b52b02af', 50, 10, '2026-04-17 03:27:07', 'store-1'),
('eaec506b-2f31-4c8c-b673-7417e5774f09', 36, 10, '2026-04-17 10:37:08', 'store-1'),
('a29e0af4-f195-44ed-b41c-cf401a778755', 30, 10, '2026-04-16 08:03:26', 'store-1'),
('6f9cae7a-9001-4fb1-b6d4-b9ad5ec08737', 45, 10, '2026-04-16 08:03:26', 'store-1'),
('bd300935-f4ad-4ef9-8cda-7d5fef84cdb0', 99, 10, '2026-04-18 08:39:28', 'store-1'),
('442cf449-86f5-41f1-a70f-3c2182663083', 28, 10, '2026-04-17 07:20:55', 'store-1'),
('1def8660-4563-4d58-b8ea-fda1ed818660', 100, 5, '2026-04-17 09:09:51', 'store-1'),
('f067ec66-feec-4957-8353-f3337a49f373', 5, 5, '2026-04-18 08:30:50', 'store-1'),
('19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 43, 5, '2026-04-19 15:57:16', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('87f9b012-3ba8-4310-b6a2-41c6c4faee83', 1, 5, '2026-04-21 06:51:08', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc');

-- Data for orders -> orders
INSERT OR IGNORE INTO orders (id, order_no, user_id, customer_id, sub_total, discount, tax, total_amount, payment_method, status, is_synced, remark, created_at, updated_at, debtor_name, debtor_id, store_id) VALUES
('c08e3d6e-52aa-48ec-a30b-3b888c302ce7', 'POS-1776328707321', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 45, 0, 0, 45, 'cash', 'completed', 0, NULL, '2026-04-16 08:38:27', '2026-04-16 08:38:27', NULL, NULL, 'store-1'),
('6aeaf1d9-56ba-443f-88a1-60f5b6c96a91', 'POS-1776406514998', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 45, 0, 0, 45, 'cash', 'completed', 0, NULL, '2026-04-17 06:15:14', '2026-04-17 06:54:47', 'Test', '1a3df764-fe8b-414e-8f22-8060dc452529', 'store-1'),
('85854268-b858-4e43-99bc-50c621c94097', 'POS-1776410467263', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 25, 0, 0, 25, 'cash', 'completed', 0, NULL, '2026-04-17 07:21:07', '2026-04-17 07:21:42', 'Test', '1a3df764-fe8b-414e-8f22-8060dc452529', 'store-1'),
('3f314ebb-a779-45a0-b1aa-36388c770a37', 'POS-1776410474873', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 43, 0, 0, 18, 'cash', 'completed', 0, NULL, '2026-04-17 07:21:14', '2026-04-17 07:22:34', 'Test', '1a3df764-fe8b-414e-8f22-8060dc452529', 'store-1'),
('7ce441ef-7683-4972-a8cf-7ef40a116973', 'POS-1776410530067', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 25, 0, 0, 25, 'cash', 'completed', 0, NULL, '2026-04-17 07:22:10', '2026-04-17 07:22:10', NULL, NULL, 'store-1'),
('879f1362-9f9b-4abd-9534-2f721b1333f4', 'POS-1776420104622', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 33, 0, 0, 33, 'cash', 'completed', 0, NULL, '2026-04-17 10:01:44', '2026-04-19 12:59:56', 'Test', '1a3df764-fe8b-414e-8f22-8060dc452529', 'store-1'),
('bac2dd63-4901-432a-b695-497bdd2f9307', 'POS-1776422228569', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 25, 0, 0, 25, 'cash', 'completed', 0, NULL, '2026-04-17 10:37:08', '2026-04-17 10:37:08', NULL, NULL, 'store-1'),
('9ddf21d2-afc6-484e-a751-f7a484a75f96', 'POS-1776437454615', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 10, 0, 0, 10, 'cash', 'completed', 0, NULL, '2026-04-17 14:50:54', '2026-04-17 14:50:54', NULL, NULL, 'store-1'),
('e1fcf8e1-71ed-4bb5-b565-21cb217175bc', 'POS-1776437541138', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 10, 0, 0, 10, 'cash', 'completed', 0, NULL, '2026-04-17 14:52:21', '2026-04-17 14:52:21', NULL, NULL, 'store-1'),
('fecd445f-3ae4-4f36-9244-be7bd0bd566b', 'POS-1776609212702', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 10, 0, 0, 10, 'qr_promptpay', 'completed', 0, NULL, '2026-04-19 14:33:32', '2026-04-19 14:33:32', NULL, NULL, 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('06a6e8d4-49aa-4ebb-9599-6b52bf47238d', 'POS-1776612371507', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 15, 0, 0, 15, 'cash', 'completed', 0, NULL, '2026-04-19 15:26:11', '2026-04-19 15:55:43', NULL, NULL, 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('92595756-4753-4361-b6e7-7f09cb2e02a8', 'POS-1776613284305', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 15, 0, 0, 15, 'outstanding', 'รอชำระพร้อมเพย์', 0, NULL, '2026-04-19 15:41:24', '2026-04-19 15:41:24', NULL, NULL, 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('e9dd44a9-63fd-4dc6-a01b-1a318581fc6d', 'POS-1776614173727', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 15, 0, 0, 15, 'cash', 'completed', 0, NULL, '2026-04-19 15:56:13', '2026-04-19 15:57:00', 'Test', '3e1374a6-d0a0-4865-bc39-93e5fadb098e', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('e9c694cf-c4fb-4e2a-8ab8-297257ac8760', 'POS-1776614236646', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 10, 0, 0, 10, 'cash', 'completed', 0, NULL, '2026-04-19 15:57:16', '2026-04-19 16:00:04', 'Test', '3e1374a6-d0a0-4865-bc39-93e5fadb098e', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('c8b996c7-b884-4c53-be56-4d0e6b2cbfcf', 'POS-1776614415445', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 20, 0, 0, 20, 'outstanding', 'รอชำระพร้อมเพย์', 0, NULL, '2026-04-19 16:00:15', '2026-04-19 16:00:15', 'Test', '3e1374a6-d0a0-4865-bc39-93e5fadb098e', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('9d8f7cf6-fc27-4ad7-bd72-63bfc02044a6', 'POS-1776754268392', 'e6375492-0fc9-400c-9144-8e583f64261f', NULL, 20, 0, 0, 20, 'cash', 'completed', 0, NULL, '2026-04-21 06:51:08', '2026-04-21 06:51:08', NULL, NULL, 'b9c939e2-de41-4c27-bea2-99ad070f3bbc');

-- Data for order_items -> order_items
INSERT OR IGNORE INTO order_items (id, order_id, product_id, quantity, unit_price, discount, total_price) VALUES
('387bcabf-ded3-471f-85d0-280e62fc3853', 'c08e3d6e-52aa-48ec-a30b-3b888c302ce7', '442cf449-86f5-41f1-a70f-3c2182663083', 1, 45, 0, 45),
('c3038ebd-cd42-4a8d-baf4-988193cbb482', '6aeaf1d9-56ba-443f-88a1-60f5b6c96a91', '442cf449-86f5-41f1-a70f-3c2182663083', 1, 45, 0, 45),
('8f2f4d26-b264-4dec-8673-81d17ee1a741', '85854268-b858-4e43-99bc-50c621c94097', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 1, 25, 0, 25),
('3ea71767-8a74-45b2-b3f5-b186c80a2d6e', '3f314ebb-a779-45a0-b1aa-36388c770a37', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 1, 25, 0, 25),
('1b66d90a-7272-4da4-9e28-22d8853db20c', '3f314ebb-a779-45a0-b1aa-36388c770a37', '41d3d63a-0063-457d-a75d-a273df326363', 1, 18, 0, 18),
('576e95c4-e5d9-41ed-92bf-10dd58acd120', '7ce441ef-7683-4972-a8cf-7ef40a116973', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 1, 25, 0, 25),
('f3695522-18f3-4ff3-94f8-c537388de656', '879f1362-9f9b-4abd-9534-2f721b1333f4', '41d3d63a-0063-457d-a75d-a273df326363', 1, 18, 0, 18),
('d86454c3-f9a2-480e-896f-9265bccaa189', '879f1362-9f9b-4abd-9534-2f721b1333f4', 'bd300935-f4ad-4ef9-8cda-7d5fef84cdb0', 1, 15, 0, 15),
('361eb0b0-9220-4ca5-adae-a27d25829d94', 'bac2dd63-4901-432a-b695-497bdd2f9307', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 1, 25, 0, 25),
('df46af68-c27b-4917-8f49-67c695e7030d', '9ddf21d2-afc6-484e-a751-f7a484a75f96', '409abacc-a31d-44d0-be90-7b0eeb9c3654', 1, 10, 0, 10),
('55c52120-e940-4dd1-aae5-a32e68a5fb47', 'e1fcf8e1-71ed-4bb5-b565-21cb217175bc', '409abacc-a31d-44d0-be90-7b0eeb9c3654', 1, 10, 0, 10),
('b974b1a6-afe1-4027-aec0-341bc51299f1', 'fecd445f-3ae4-4f36-9244-be7bd0bd566b', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 2, 5, 0, 10),
('ef9cb0cd-eaf8-4f6a-b405-2190a9ed424e', '06a6e8d4-49aa-4ebb-9599-6b52bf47238d', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 3, 5, 0, 15),
('3e6cf4c5-363f-4c74-a408-58196061f857', '92595756-4753-4361-b6e7-7f09cb2e02a8', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 3, 5, 0, 15),
('4f82430a-12c1-4b5b-9939-7c35c9f142b4', 'e9dd44a9-63fd-4dc6-a01b-1a318581fc6d', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 3, 5, 0, 15),
('63828679-c0f9-4e4e-b763-e6b6b8183818', 'e9c694cf-c4fb-4e2a-8ab8-297257ac8760', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 2, 5, 0, 10),
('f23795c2-6032-4783-b3b2-e033c7cd1bd1', 'c8b996c7-b884-4c53-be56-4d0e6b2cbfcf', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 4, 5, 0, 20),
('cc997eff-1757-4666-b0cc-0ba0197a09d5', '9d8f7cf6-fc27-4ad7-bd72-63bfc02044a6', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 4, 5, 0, 20);

-- Data for payments -> payments
INSERT OR IGNORE INTO payments (id, order_id, payment_type, amount, reference_no, created_at) VALUES
('86770366-2b8f-4e6f-8a78-1fb6625900fe', 'c08e3d6e-52aa-48ec-a30b-3b888c302ce7', 'cash', 45, NULL, '2026-04-16 08:38:27'),
('31f342eb-9d25-496a-986b-7127a642f9df', '6aeaf1d9-56ba-443f-88a1-60f5b6c96a91', 'cash', 45, NULL, '2026-04-17 06:54:47'),
('2b9d784c-c123-4bb8-8669-53d9f01ecbc4', '85854268-b858-4e43-99bc-50c621c94097', 'cash', 25, NULL, '2026-04-17 07:21:42'),
('bc59ccb6-6dbc-450a-b724-d07fc81d1b74', '3f314ebb-a779-45a0-b1aa-36388c770a37', 'cash', 25, NULL, '2026-04-17 07:21:42'),
('8255e8bf-995d-4566-8fb0-0e4d4091beec', '7ce441ef-7683-4972-a8cf-7ef40a116973', 'cash', 25, NULL, '2026-04-17 07:22:10'),
('9d45a184-099a-4eb9-a7be-d630355ce144', '3f314ebb-a779-45a0-b1aa-36388c770a37', 'cash', 18, NULL, '2026-04-17 07:22:34'),
('fb1d90e2-d359-4287-bd43-12737cedbd02', 'bac2dd63-4901-432a-b695-497bdd2f9307', 'cash', 25, NULL, '2026-04-17 10:37:08'),
('76f4e8a5-8d26-47a5-9de2-61c1dceb37c0', '9ddf21d2-afc6-484e-a751-f7a484a75f96', 'cash', 10, NULL, '2026-04-17 14:50:54'),
('95efd1e0-d5c7-400d-bfb0-229378bf2e52', 'e1fcf8e1-71ed-4bb5-b565-21cb217175bc', 'cash', 10, NULL, '2026-04-17 14:52:21'),
('73960ebc-ea66-4b17-8fc6-f05bdea59091', '879f1362-9f9b-4abd-9534-2f721b1333f4', 'cash', 33, NULL, '2026-04-19 12:59:56'),
('979d5f05-7f38-41ef-9987-60df2c5a192b', 'fecd445f-3ae4-4f36-9244-be7bd0bd566b', 'qr_promptpay', 10, NULL, '2026-04-19 14:33:32'),
('3a1f26b0-b012-43c1-b6b1-65359584c894', '06a6e8d4-49aa-4ebb-9599-6b52bf47238d', 'cash', 15, NULL, '2026-04-19 15:55:43'),
('f6c49573-d3b1-49a4-9c5e-b4452ca71170', 'e9dd44a9-63fd-4dc6-a01b-1a318581fc6d', 'cash', 15, NULL, '2026-04-19 15:57:00'),
('653d863b-dab0-44e8-8146-1e1aa286cec9', 'e9c694cf-c4fb-4e2a-8ab8-297257ac8760', 'cash', 10, NULL, '2026-04-19 16:00:04'),
('b1196165-eae4-4e7b-bb1c-5bdad40c974a', '9d8f7cf6-fc27-4ad7-bd72-63bfc02044a6', 'cash', 20, NULL, '2026-04-21 06:51:08');

-- Data for stock_transactions -> stock_transactions
INSERT OR IGNORE INTO stock_transactions (id, product_id, user_id, type, quantity, remark, created_at, store_id) VALUES
('cc65f210-0f38-4983-9b6b-930acd30f689', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776326883752', '2026-04-16 08:08:03', 'store-1'),
('1a7eb8b2-8c90-4e5b-bd7c-0e7ed971a5db', '90c17c86-cbeb-4f0e-b6d4-4b97b52b02af', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776326883752', '2026-04-16 08:08:03', 'store-1'),
('df7b3b75-97c5-40c1-ad8d-29166b5d36f9', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776326883752', '2026-04-16 08:08:03', 'store-1'),
('e1c60ba8-4bc2-446d-b8fb-9d78e76fe08e', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776328707321', '2026-04-16 08:38:27', 'store-1'),
('4d93f722-f696-437f-9beb-35c40af4ca24', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776326883752', '2026-04-17 03:27:07', 'store-1'),
('522cc3c0-9b20-49c1-bd13-85ae52b65e9a', '90c17c86-cbeb-4f0e-b6d4-4b97b52b02af', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776326883752', '2026-04-17 03:27:07', 'store-1'),
('d9fd66a8-6c5d-47e5-9937-dc9ef93e5848', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776326883752', '2026-04-17 03:27:07', 'store-1'),
('9a941305-023a-42b7-8620-f90f5adc4229', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776405463334', '2026-04-17 05:57:43', 'store-1'),
('831dce1c-e7ae-41de-9884-2d7e717067d9', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776405463334', '2026-04-17 05:58:15', 'store-1'),
('027d2669-3039-491f-9c99-6c673434a942', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776406514998', '2026-04-17 06:15:15', 'store-1'),
('65e7a3f8-a689-4228-8fd8-7b2c9714f5c9', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776406540745', '2026-04-17 06:15:40', 'store-1'),
('8d41f865-b46d-4949-8097-d6d40c2b0833', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776406540745', '2026-04-17 06:44:19', 'store-1'),
('46b865e8-814e-4f93-be47-b13dff3eb5eb', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776408867613', '2026-04-17 06:54:27', 'store-1'),
('992743bd-518a-4bd4-b393-9d722c532a9f', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776410215991', '2026-04-17 07:16:56', 'store-1'),
('ce0adb7d-ecfa-406d-ac7b-97c97ac6a3a1', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776410337113', '2026-04-17 07:18:57', 'store-1'),
('e45935d3-b3e5-4569-aa28-c8c83268e8ef', '442cf449-86f5-41f1-a70f-3c2182663083', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776410337113', '2026-04-17 07:20:55', 'store-1'),
('8d2be944-afbe-49c0-b2f7-8970e0581415', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776410215991', '2026-04-17 07:20:57', 'store-1'),
('1c0e2057-fd70-4136-a5db-9a3f58186396', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'return', 1, 'Void - POS-1776408867613', '2026-04-17 07:21:00', 'store-1'),
('84bba0d0-76f9-4db4-a857-49bfc391197c', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776410467263', '2026-04-17 07:21:07', 'store-1'),
('09ab3908-f6d4-45d2-b213-1bb305c28a6e', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776410474873', '2026-04-17 07:21:14', 'store-1'),
('f8bec2e4-7968-458a-94d4-9ac9d0a2c623', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776410474873', '2026-04-17 07:21:14', 'store-1'),
('7d2738e3-854d-45f3-8e08-ee7edf9286a1', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776410530067', '2026-04-17 07:22:10', 'store-1'),
('a5ddb550-261e-419b-9148-0b1dc1d5cbf8', '1def8660-4563-4d58-b8ea-fda1ed818660', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 100, 'รับเข้าสต๊อก', '2026-04-17 00:00:00', 'store-1'),
('6927f091-3a8b-44f2-89d1-b1df3746335b', '41d3d63a-0063-457d-a75d-a273df326363', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776420104622', '2026-04-17 10:01:44', 'store-1'),
('9f510a04-09f5-4c9d-bae8-711f1fe17f40', 'bd300935-f4ad-4ef9-8cda-7d5fef84cdb0', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Outstanding - POS-1776420104622', '2026-04-17 10:01:44', 'store-1'),
('6917477b-7a48-4deb-9813-223126625c77', 'eaec506b-2f31-4c8c-b673-7417e5774f09', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776422228569', '2026-04-17 10:37:08', 'store-1'),
('fa3037ac-2665-44f2-9ee5-ec18ce6cb805', '409abacc-a31d-44d0-be90-7b0eeb9c3654', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776437454615', '2026-04-17 14:50:54', 'store-1'),
('bca85367-5fe5-4490-a06a-d3e162f99de1', '409abacc-a31d-44d0-be90-7b0eeb9c3654', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -1, 'Sale - POS-1776437541138', '2026-04-17 14:52:21', 'store-1'),
('03a6ad1c-25f9-428e-8f32-885b03c26d70', 'f067ec66-feec-4957-8353-f3337a49f373', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 5, 'รับเข้าสต๊อก', '2026-04-18 00:00:00', 'store-1'),
('bb4582a2-bfee-43d9-9529-e58ebb3365f2', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 50, 'รับเข้าสต๊อก', '2026-04-19 00:00:00', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('38c51e31-f3fa-41d2-82fd-ed2d5101eac4', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 5, 'รับเข้าสต๊อก', '2026-04-19 00:00:00', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('a0e02d24-ec91-4fae-b633-d0a2d3cd8f8b', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -2, 'Sale - POS-1776609212702', '2026-04-19 14:33:32', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('72100b1a-cbe7-4b14-a6d8-9b7d20145e92', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -3, 'Outstanding - POS-1776612371507', '2026-04-19 15:26:11', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('819055ad-be7d-416b-9f08-7aaf68cc11e8', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -3, 'Outstanding - POS-1776613284305', '2026-04-19 15:41:24', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('e3f8577e-f782-477e-8238-5995feae3a3a', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -3, 'Outstanding - POS-1776614173727', '2026-04-19 15:56:13', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('48cc9d23-33dd-4a53-85e8-d5fd920354ec', '19f4037a-8b2a-4c4b-bcef-df6c0763e31f', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -2, 'Outstanding - POS-1776614236646', '2026-04-19 15:57:16', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('2b2021e8-39ae-47b9-994f-525296447211', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -4, 'Outstanding - POS-1776614415445', '2026-04-19 16:00:15', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('c7390f64-f2d6-47f8-a866-696ee25f1656', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 5, 'รับเข้าสต๊อก', '2026-04-21 00:00:00', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('73540022-96cd-4277-a7ce-53952d1a1b8b', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'receive', 5, 'รับเข้าสต๊อก', '2026-04-21 00:00:00', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc'),
('ae94b08c-8277-4588-a95d-63ad2c1db04b', '87f9b012-3ba8-4310-b6a2-41c6c4faee83', 'e6375492-0fc9-400c-9144-8e583f64261f', 'sale', -4, 'Sale - POS-1776754268392', '2026-04-21 06:51:08', 'b9c939e2-de41-4c27-bea2-99ad070f3bbc');

-- Data for user_stores -> user_stores
INSERT OR IGNORE INTO user_stores (user_id, store_id, is_active) VALUES
('ddf8d68d-5aa8-47bf-a6d2-15819749f54a', 'store-1', 1),
('e6375492-0fc9-400c-9144-8e583f64261f', 'store-1', 1),
('112a5c70-8033-44d4-ac19-92ca25c14025', 'store-1', 1);

-- Data for ocr_receipts -> ocr_receipts
INSERT OR IGNORE INTO ocr_receipts (id, store_id, user_id, image_url, storage_key, status, raw_ocr_data, structured_data, total_amount, vendor_name, receipt_date, error_message, created_at, updated_at, payment_method, transaction_id) VALUES
('2a156304-22f3-4883-97ab-f8da38f10128', 'store-1', 'e6375492-0fc9-400c-9144-8e583f64261f', 'https://pub-d470ad59fc6847be90201e4afcb7ad10.r2.dev/receipts/072e16ee-b874-42c8-b19c-2272a2db9b7a.jpeg', 'receipts/072e16ee-b874-42c8-b19c-2272a2db9b7a.jpeg', 'completed', NULL, '{"vendor_name":"CP Axtra PCL บ้านบึง (ชลบุรี)","receipt_date":"2026-04-21","total_amount":3811,"payment_method":"QR","transaction_id":"APIC1776778435126PM8","items":[{"raw_name":"นมหามงคลชุดผ้าไตรอย่างดี1.9*2.8ม.","quantity":1,"unit_price":777,"total_price":777},{"raw_name":"คาราบาวแดงเครื่องดื่ม150มล.X10ขวด","quantity":2,"unit_price":88,"total_price":176},{"raw_name":"เอ็ม-150 ฝาเหลือง 150 มล. X 10","quantity":2,"unit_price":86,"total_price":172},{"raw_name":"TNโค้ก 1.25 ลิตร X 12ข","quantity":1,"unit_price":322,"total_price":322},{"raw_name":"เบียร์ช้างคลาสสิคใหญ่ 620มล.X15","quantity":3,"unit_price":788,"total_price":2364}]}', 3811, 'CP Axtra PCL บ้านบึง (ชลบุรี)', '2026-04-21', NULL, '2026-04-23 06:05:16', '2026-04-23T06:05:25.948Z', 'QR', 'APIC1776778435126PM8'),
('f73b6be9-15b2-490e-9260-f011c7255069', 'store-1', 'e6375492-0fc9-400c-9144-8e583f64261f', 'https://pub-d470ad59fc6847be90201e4afcb7ad10.r2.dev/receipts/0926053f-ce6c-43da-869f-6e7d62834ce5.jpeg', 'receipts/0926053f-ce6c-43da-869f-6e7d62834ce5.jpeg', 'completed', NULL, '{"vendor_name":"CP AXTRA บ้านบึง","receipt_date":null,"total_amount":2454,"payment_method":"Credit Card","transaction_id":"539411XXXXXX2599","items":[{"raw_name":"ไฮยีน ครีมมี่ 1000มล 1+1","quantity":1,"unit_price":189,"total_price":189},{"raw_name":"ไฮยีน ครีมมี่ 1000มล 1+1","quantity":1,"unit_price":189,"total_price":189},{"raw_name":"เปาเอ็มวอซอฟท์ 3000ก.","quantity":1,"unit_price":139,"total_price":139},{"raw_name":"บรีสสูตรป้องกันสีตก1300","quantity":1,"unit_price":185,"total_price":185},{"raw_name":"บรีสสูตรป้องกันสีตก1300","quantity":1,"unit_price":185,"total_price":185},{"raw_name":"บรีสสูตรป้องกันสีตก1300","quantity":1,"unit_price":185,"total_price":185},{"raw_name":"บรีสสูตรป้องกันสีตก1300","quantity":1,"unit_price":185,"total_price":185},{"raw_name":"ซันไลต์LEMON TURBO1850มล","quantity":1,"unit_price":100,"total_price":100},{"raw_name":"วังขนายน้ำตาลธรรมชาติ1กก","quantity":4,"unit_price":29,"total_price":116},{"raw_name":"ฉัตรหอมมะลิใหม่100%5กก","quantity":1,"unit_price":219,"total_price":219},{"raw_name":"ไวไวหมูสับต้มยำ 60ก.x10","quantity":1,"unit_price":59,"total_price":59},{"raw_name":"ยำยำจัมโบ้หมูสับ60กx10","quantity":1,"unit_price":60,"total_price":60},{"raw_name":"ซิลค์ซอฟท์แพ็ค 140แผ่นX3","quantity":1,"unit_price":77,"total_price":77},{"raw_name":"ซิลค์ซอฟท์แพ็ค 140แผ่นX3","quantity":1,"unit_price":77,"total_price":77},{"raw_name":"ไดมอนด์ไซน์325+300มล","quantity":1,"unit_price":159,"total_price":159},{"raw_name":"เซรั่มไดมอนด์ไซน์45มล","quantity":1,"unit_price":99,"total_price":99},{"raw_name":"แอมเม็ลทซ์ 82 มล","quantity":1,"unit_price":183,"total_price":183},{"raw_name":"แอมบิเพอร์เจลครีมมี่180ก","quantity":1,"unit_price":79,"total_price":79},{"raw_name":"แอมบิเพอร์ เจล บลิส 180ก","quantity":1,"unit_price":79,"total_price":79},{"raw_name":"โชกุบุซึ ลาเวนเดอร์400มล","quantity":1,"unit_price":174,"total_price":174},{"raw_name":"ดัชชี่ธรรมชาติ125ก.X4","quantity":1,"unit_price":52,"total_price":52},{"raw_name":"สก๊อตช์ไบรตเล็กฟองน้ำ2+1","quantity":1,"unit_price":34,"total_price":34}]}', 2454, 'CP AXTRA บ้านบึง', 'null', NULL, '2026-04-23 11:50:12', '2026-04-23T11:50:33.573Z', 'Credit Card', '539411XXXXXX2599'),
('af74bed1-f706-4133-bdb8-d618181bd061', 'store-1', 'e6375492-0fc9-400c-9144-8e583f64261f', 'https://pub-d470ad59fc6847be90201e4afcb7ad10.r2.dev/receipts/859de70b-1620-4aff-9cb2-0377f84c6748.jpeg', 'receipts/859de70b-1620-4aff-9cb2-0377f84c6748.jpeg', 'completed', NULL, '{"vendor_name":"CP Axtra PCL บ้านบึง (ชลบุรี)","receipt_date":"2026-04-21","total_amount":3811,"payment_method":"QR","transaction_id":"APIC1776778435126PM8","items":[{"raw_name":"ห่มหามงคลชุดผ้าไตรอย่างดี1.9*2.8ม.","quantity":1,"unit_price":777,"total_price":777},{"raw_name":"คาราบาวแดง เครื่องดื่ม150มล.X10ขวด","quantity":2,"unit_price":88,"total_price":176},{"raw_name":"เอ็ม-150  ฝาเหลื���ง 150 มล. X 10","quantity":2,"unit_price":86,"total_price":172},{"raw_name":"โค้ก 1.25 ลิตร X 12บ","quantity":1,"unit_price":322,"total_price":322},{"raw_name":"เบียร์ช้างคลาสสิคใหญ่ 620มล.X15","quantity":3,"unit_price":788,"total_price":2364}]}', 3811, 'CP Axtra PCL บ้านบึง (ชลบุรี)', '2026-04-21', NULL, '2026-04-28 09:45:59', '2026-04-28T09:53:37.103Z', 'QR', 'APIC1776778435126PM8');

-- Data for ocr_receipt_items -> ocr_receipt_items
INSERT OR IGNORE INTO ocr_receipt_items (id, receipt_id, product_id, raw_name, matched_name, quantity, unit_price, total_price, is_stock_updated) VALUES
('eb86e645-8fb8-4562-9824-a133b31da538', '2a156304-22f3-4883-97ab-f8da38f10128', NULL, 'นมหามงคลชุดผ้าไตรอย่างดี1.9*2.8ม.', NULL, 1, 777, 777, 0),
('ef304429-de9b-4667-a094-72cebab021cd', '2a156304-22f3-4883-97ab-f8da38f10128', NULL, 'คาราบาวแดงเครื่องดื่ม150มล.X10ขวด', NULL, 2, 88, 176, 0),
('f1a9ded1-c83f-4474-867f-483d2dbe949b', '2a156304-22f3-4883-97ab-f8da38f10128', NULL, 'เอ็ม-150 ฝาเหลือง 150 มล. X 10', NULL, 2, 86, 172, 0),
('dcc6dac3-3b88-4648-add9-37dd0a933711', '2a156304-22f3-4883-97ab-f8da38f10128', NULL, 'TNโค้ก 1.25 ลิตร X 12ข', NULL, 1, 322, 322, 0),
('d37631b6-39a3-43f6-815e-1b78461f6e3e', '2a156304-22f3-4883-97ab-f8da38f10128', NULL, 'เบียร์ช้างคลาสสิคใหญ่ 620มล.X15', NULL, 3, 788, 2364, 0),
('68ca48c3-9389-44d3-ba81-48495712fd7e', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ไฮยีน ครีมมี่ 1000มล 1+1', NULL, 1, 189, 189, 0),
('0bf609e4-8829-4ad7-b421-11f4b0317fef', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ไฮยีน ครีมมี่ 1000มล 1+1', NULL, 1, 189, 189, 0),
('23f88238-3242-47c3-bb9d-fc8633f779f4', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'เปาเอ็มวอซอฟท์ 3000ก.', NULL, 1, 139, 139, 0),
('59562114-f04c-4184-9f64-f67ce1ea09a9', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'บรีสสูตรป้องกันสีตก1300', NULL, 1, 185, 185, 0),
('647eaf5b-c7e4-40b2-96e5-20740fdde97d', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'บรีสสูตรป้องกันสีตก1300', NULL, 1, 185, 185, 0),
('3ee32ce0-e426-4346-8d5c-c8275d2733a5', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'บรีสสูตรป้องกันสีตก1300', NULL, 1, 185, 185, 0),
('c71ba4c9-ed40-4548-ae6f-5c4d583eae2c', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'บรีสสูตรป้องกันสีตก1300', NULL, 1, 185, 185, 0),
('0363c60d-e37d-46fa-a696-79861e7dab32', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ซันไลต์LEMON TURBO1850มล', NULL, 1, 100, 100, 0),
('b62bad81-13ca-4fd7-ad0d-f3b244b0e119', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'วังขนายน้ำตาลธรรมชาติ1กก', NULL, 4, 29, 116, 0),
('3e483b3f-d2f5-4f70-9691-9829093a2b91', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ฉัตรหอมมะลิใหม่100%5กก', NULL, 1, 219, 219, 0),
('5b5b4713-3006-4f70-a39b-ce5c837a9994', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ไวไวหมูสับต้มยำ 60ก.x10', NULL, 1, 59, 59, 0),
('a88f143f-93f3-409c-befb-04a2d540b591', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ยำยำจัมโบ้หมูสับ60กx10', NULL, 1, 60, 60, 0),
('c0f43be1-cbff-47d9-a0c3-8a3735b14f10', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ซิลค์ซอฟท์แพ็ค 140แผ่นX3', NULL, 1, 77, 77, 0),
('80de8b46-bb56-4243-b041-692636cd3119', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ซิลค์ซอฟท์แพ็ค 140แผ่นX3', NULL, 1, 77, 77, 0),
('3a153c8e-f017-4eca-a9da-dda688da7872', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ไดมอนด์ไซน์325+300มล', NULL, 1, 159, 159, 0),
('90681629-429b-423f-a9f0-830c78dd36bb', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'เซรั่มไดมอนด์ไซน์45มล', NULL, 1, 99, 99, 0),
('b155ded2-1978-40af-910d-34ae387d6c32', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'แอมเม็ลทซ์ 82 มล', NULL, 1, 183, 183, 0),
('ba017296-4dde-4f03-bca9-f7aa3fbc48de', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'แอมบิเพอร์เจลครีมมี่180ก', NULL, 1, 79, 79, 0),
('b39a31ad-b1d2-4353-b7c6-46bdb96b6dfd', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'แอมบิเพอร์ เจล บลิส 180ก', NULL, 1, 79, 79, 0),
('8f184284-4c06-4423-a1b1-e41a37e6d326', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'โชกุบุซึ ลาเวนเดอร์400มล', NULL, 1, 174, 174, 0),
('29ec85d3-08d1-4157-878e-6005a645ed3b', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'ดัชชี่ธรรมชาติ125ก.X4', NULL, 1, 52, 52, 0),
('4212cf84-104b-4cc4-9b2a-39404bba4510', 'f73b6be9-15b2-490e-9260-f011c7255069', NULL, 'สก๊อตช์ไบรตเล็กฟองน้ำ2+1', NULL, 1, 34, 34, 0),
('50a96cc3-86c1-4733-be8d-cec359f9786d', 'af74bed1-f706-4133-bdb8-d618181bd061', NULL, 'คาราบาวแดง เครื่องดื่ม150มล.X10ขวด', NULL, 2, 88, 176, 0),
('ec7f8cc7-b02f-48a9-80e7-744bea913a87', 'af74bed1-f706-4133-bdb8-d618181bd061', NULL, 'เอ็ม-150  ฝาเหลื���ง 150 มล. X 10', NULL, 2, 86, 172, 0),
('37575683-a0bb-4210-a4c1-2802a8f9f3e9', 'af74bed1-f706-4133-bdb8-d618181bd061', NULL, 'โค้ก 1.25 ลิตร X 12บ', NULL, 1, 322, 322, 0),
('888a9405-2442-42c6-9edc-b8ac1c4ca3d0', 'af74bed1-f706-4133-bdb8-d618181bd061', NULL, 'เบียร์ช้างคลาสสิคใหญ่ 620มล.X15', NULL, 3, 788, 2364, 0);

PRAGMA foreign_keys = ON;