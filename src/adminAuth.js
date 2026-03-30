/**
 * ADMIN AUTHENTICATION SYSTEM
 * JWT-based authentication for admin users
 */

const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'nyathira-admin-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

/**
 * Hardcoded admin credentials (in production, store in database with hashed passwords)
 */
const ADMIN_USERS = {
  'irene': {
    password: process.env.ADMIN_PASSWORD_IRENE || 'secure-password-irene',
    name: 'Irene Kariuki',
    email: 'irene@nyathirahomes.com',
    property: 'nyathira'
  },
  'susan': {
    password: process.env.ADMIN_PASSWORD_SUSAN || 'secure-password-susan',
    name: 'Susan Koech',
    email: 'susan@nyathirahomes.com',
    property: 'kibabu'
  },
  'manager': {
    password: process.env.ADMIN_PASSWORD_MANAGER || 'secure-password-manager',
    name: 'Property Manager',
    email: 'manager@nyathirahomes.com',
    property: null // Full access
  }
};

/**
 * Generate JWT token for admin user
 */
function generateToken(username) {
  const user = ADMIN_USERS[username];
  if (!user) return null;

  const token = jwt.sign(
    {
      username,
      name: user.name,
      email: user.email,
      property: user.property,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return token;
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Authenticate admin user with username/password
 */
function authenticateUser(username, password) {
  const user = ADMIN_USERS[username];
  
  if (!user) {
    return { ok: false, error: 'Invalid username or password' };
  }

  if (user.password !== password) {
    return { ok: false, error: 'Invalid username or password' };
  }

  const token = generateToken(username);
  return {
    ok: true,
    token,
    user: {
      username,
      name: user.name,
      email: user.email,
      property: user.property
    }
  };
}

/**
 * Middleware: Check if request has valid admin token
 */
function adminAuthMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Missing authorization token' });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  req.admin = decoded;
  next();
}

/**
 * Middleware: Check if admin has access to specific property
 */
function propertyAccessMiddleware(req, res, next) {
  const admin = req.admin;
  
  // Manager has full access
  if (!admin.property) {
    return next();
  }

  // Property-specific admins can only access their property
  const requestedProperty = req.query.property || req.body.property;
  
  if (requestedProperty && requestedProperty !== admin.property) {
    return res.status(403).json({ ok: false, error: 'Access denied: insufficient permissions' });
  }

  next();
}

/**
 * Middleware: Check if admin has specific permission
 */
function permissionMiddleware(permission) {
  return (req, res, next) => {
    const admin = req.admin;

    // All admins can read. Managers can write.
    if (permission === 'read') {
      return next();
    }

    if (permission === 'write' && !admin.property) {
      // Manager (full access) can write
      return next();
    }

    return res.status(403).json({ ok: false, error: 'Access denied: insufficient permissions' });
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateUser,
  adminAuthMiddleware,
  propertyAccessMiddleware,
  permissionMiddleware,
  JWT_SECRET,
  JWT_EXPIRY
};
