const router = require("express").Router();
const protect = require("../../middleware/auth.middleware");
const { getCart, addToCart, updateQty, removeFromCart } = require("./cart.controller");

router.get("/", protect, getCart);
router.post("/", protect, addToCart);
router.put("/:productId", protect, updateQty);
router.delete("/:productId", protect, removeFromCart);

module.exports = router;
