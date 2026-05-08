const express = require("express");
const db = require("../database/dbHelper");
const { authenticate } = require("../middleware/auth");
const { AppError } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

router.post("/open", authenticate, async (req, res, next) => {
  try {
    const { opening_amount = 0 } = req.body;
    const existing = await db.get("SELECT id FROM shifts WHERE user_id = ? AND status = 'open' AND store_id = ?", [req.user.id, req.store_id]);
    if (existing) return next(new AppError("You already have an open shift in this store", 400));
    const id = uuidv4();
    await db.run("INSERT INTO shifts (id, user_id, opening_amount, store_id) VALUES (?,?,?,?)", [id, req.user.id, opening_amount, req.store_id]);
    const shift = await db.get("SELECT * FROM shifts WHERE id = ? AND store_id = ?", [id, req.store_id]);
    res.status(201).json({ success: true, data: shift });
  } catch (err) { next(err); }
});

router.post("/close", authenticate, async (req, res, next) => {
  try {
    const { closing_amount } = req.body;
    const shift = await db.get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' AND store_id = ?", [req.user.id, req.store_id]);
    if (!shift) return next(new AppError("No open shift found", 404));
    const salesResult = await db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE user_id = ? AND status = 'completed' AND payment_method = 'cash' AND created_at >= ? AND store_id = ?", [req.user.id, shift.opened_at, req.store_id]);
    const expectedAmount = shift.opening_amount + (salesResult ? salesResult.total : 0);
    const difference = closing_amount - expectedAmount;
    await db.run("UPDATE shifts SET closing_amount=?, expected_amount=?, difference=?, status='closed', closed_at=datetime('now', '+7 hours') WHERE id=? AND store_id = ?", [closing_amount, expectedAmount, difference, shift.id, req.store_id]);
    const updated = await db.get("SELECT * FROM shifts WHERE id = ? AND store_id = ?", [shift.id, req.store_id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.get("/current", authenticate, async (req, res, next) => {
  try {
    const shift = await db.get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' AND store_id = ?", [req.user.id, req.store_id]);
    res.json({ success: true, data: shift || null });
  } catch (err) { next(err); }
});

module.exports = router;
