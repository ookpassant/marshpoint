const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Verify a JWT from the Authorization: Bearer <token> header.
// Attaches { userId, email, role } to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restrict a route to one or more roles. Use after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Coordinator-only — the role that can mutate data.
const requireCoordinator = requireRole('coordinator');

module.exports = { requireAuth, requireRole, requireCoordinator, JWT_SECRET };
