const router = require("express").Router();
const protect = require("../../middleware/auth.middleware");
const adminOnly = require("../../middleware/admin.middleware");
const { list, getOne, create, update, remove } = require("./product.controller");

router.get("/", list);
router.get("/:id", getOne);
router.post("/", protect, adminOnly, create);
router.put("/:id", protect, adminOnly, update);
router.delete("/:id", protect, adminOnly, remove);

module.exports = router;
