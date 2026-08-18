const authService = require("./auth.service");

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const { user, token } = await authService.registerUser(req.body);
    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { user, token } = await authService.loginUser(req.body);
    res.json({ user, token });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login };
