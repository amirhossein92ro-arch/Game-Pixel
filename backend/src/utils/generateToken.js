const jwt = require("jsonwebtoken");

// صدور توکن JWT شامل شناسه کاربر و نقش.
function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

module.exports = generateToken;
