const router = require("express").Router();
const protect = require("../../middleware/auth.middleware");
const { getProfile } = require("./user.controller");

router.get("/profile", protect, getProfile);

module.exports = router;
