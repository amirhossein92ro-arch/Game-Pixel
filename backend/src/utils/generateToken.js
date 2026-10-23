const jwt = require("jsonwebtoken");
if(!process.env.JWT_SECRET||Buffer.byteLength(process.env.JWT_SECRET)<32||/please_change|default|secret123/i.test(process.env.JWT_SECRET))throw Error('Legacy development API requires a unique JWT_SECRET of 32+ bytes.');

// صدور توکن JWT شامل شناسه کاربر و نقش.
function generateToken(user) {
  return jwt.sign(
    { id: user._id, version: user.sessionVersion || 0 },
    process.env.JWT_SECRET,
    { algorithm:'HS256', issuer:'web2-legacy', audience:'web2-legacy', expiresIn: "1h" }
  );
}

module.exports = generateToken;
