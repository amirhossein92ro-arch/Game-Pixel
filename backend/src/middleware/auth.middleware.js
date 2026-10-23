const jwt = require("jsonwebtoken");
const User = require("../modules/users/user.model");

// بررسی توکن JWT و تزریق کاربر به req.user.
async function protect(req, res, next) {
  try {
    let token = null;
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) token = header.slice(7).trim();

    if (!token || token.length>4096) {
      return res.status(401).json({ message: "توکن احراز هویت ارسال نشده." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET,{algorithms:['HS256'],issuer:'web2-legacy',audience:'web2-legacy'});
      require('../utils/input').id(decoded.id);
      if(!Number.isSafeInteger(decoded.version))throw Error('Invalid token claims.');
    } catch {
      return res.status(401).json({ message: "توکن نامعتبر یا منقضی شده است." });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user || user.banned || !Number.isSafeInteger(decoded.version) || decoded.version!==(user.sessionVersion||0)) {
      return res.status(401).json({ message: "کاربر یافت نشد." });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = protect;
