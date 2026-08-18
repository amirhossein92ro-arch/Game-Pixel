// بررسی نقش admin — حتماً پس از middleware احراز هویت استفاده شود.
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "دسترسی مخصوص مدیران است." });
  }
  next();
}

module.exports = adminOnly;
