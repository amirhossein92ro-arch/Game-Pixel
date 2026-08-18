// GET /api/users/profile — پروفایل کاربر واردشده.
async function getProfile(req, res) {
  res.json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
}

module.exports = { getProfile };
