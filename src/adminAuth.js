/**
 * ADMIN AUTHENTICATION SYSTEM
 * JWT-based authentication for admin users
 * Uses database for credential storage with bcrypt hashing
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'nyathira-admin-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

/**
 * Get admin user with their assigned properties
 */
async function getAdminWithProperties(adminId) {
  try {
    const admin = await db('admin_users').where('id', adminId).first();
    
    if (!admin) {
      return null;
    }

    let properties = [];
    
    // Only property_admin role has property assignments
    if (admin.role === 'property_admin') {
      properties = await db('admin_properties')
        .join('properties', 'admin_properties.property_id', '=', 'properties.id')
        .where('admin_properties.admin_id', adminId)
        .select('properties.id', 'properties.property_id', 'properties.name');
    }

    return {
      ...admin,
      properties
    };
  } catch (err) {
    console.error('Error getting admin with properties:', err);
    return null;
  }
}

/**
 * Generate JWT token for admin user
 */
function generateToken(admin) {
  const token = jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      properties: admin.properties || [],
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
async function authenticateUser(username, password) {
  try {
    // Query database for admin user
    const admin = await db('admin_users')
      .where('username', username)
      .where('status', 'active')
      .first();
    
    if (!admin) {
      console.log(`[authenticateUser] User not found or inactive: ${username}`);
      return { ok: false, error: 'Invalid username or password' };
    }

    console.log(`[authenticateUser] User found. Comparing password...`);
    console.log(`[authenticateUser] Provided password: "${password}"`);
    console.log(`[authenticateUser] Hash: ${admin.password_hash.substring(0, 40)}...`);

    // Compare password with bcrypt hash
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    
    console.log(`[authenticateUser] Password match result: ${passwordMatch}`);
    
    if (!passwordMatch) {
      console.log(`[authenticateUser] Password mismatch for user: ${username}`);
      return { ok: false, error: 'Invalid username or password' };
    }

    // Update last_login
    await db('admin_users').where('id', admin.id).update({
      last_login: db.fn.now()
    });

    // Get admin with properties
    const adminWithProps = await getAdminWithProperties(admin.id);
    const token = generateToken(adminWithProps);

    return {
      ok: true,
      token,
      user: {
        id: adminWithProps.id,
        username: adminWithProps.username,
        name: adminWithProps.name,
        email: adminWithProps.email,
        role: adminWithProps.role,
        properties: adminWithProps.properties
      }
    };
  } catch (err) {
    console.error('Error authenticating user:', err);
    return { ok: false, error: 'Authentication error' };
  }
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
 * Full-admin role: always allowed
 * Property-admin role: must have property assignment in admin_properties
 */
async function propertyAccessMiddleware(req, res, next) {
  const admin = req.admin;
  
  // Full-access admins skip property validation
  if (admin.role === 'full_admin') {
    return next();
  }

  // Property-specific admins can only access assigned properties
  const requestedProperty = req.query.property || req.body.property || req.params.propertyId;
  
  if (requestedProperty) {
    // Check if admin has access to this property
    const hasAccess = admin.properties && admin.properties.some(p => 
      p.property_id === requestedProperty || String(p.id) === String(requestedProperty)
    );

    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: 'Access denied: insufficient permissions' });
    }
  }

  next();
}

/**
 * Middleware: Check if admin is full-access only
 */
function fullAccessMiddleware(req, res, next) {
  const admin = req.admin;

  if (admin.role !== 'full_admin') {
    return res.status(403).json({ ok: false, error: 'Access denied: full admin access required' });
  }

  next();
}

/**
 * Middleware: Check if admin has specific permission
 */
function permissionMiddleware(permission) {
  return (req, res, next) => {
    const admin = req.admin;

    // All authenticated admins can read
    if (permission === 'read') {
      return next();
    }

    // Full-admin can write, property-admin can also write (property-scoped)
    if (permission === 'write') {
      return next();
    }

    return res.status(403).json({ ok: false, error: 'Access denied: insufficient permissions' });
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateUser,
  getAdminWithProperties,
  adminAuthMiddleware,
  propertyAccessMiddleware,
  fullAccessMiddleware,
  permissionMiddleware,
  JWT_SECRET,
  JWT_EXPIRY
};
