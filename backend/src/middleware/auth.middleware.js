const jwt = require("jsonwebtoken");
const User = require("../modules/users/user.model");

// بررسی توکن JWT و تزریق کاربر به req.user.
async function protect(req, res, next) {
  try {
    let token = null;
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({ message: "توکن احراز هویت ارسال نشده." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "توکن نامعتبر یا منقضی شده است." });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "کاربر یافت نشد." });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = protect;
