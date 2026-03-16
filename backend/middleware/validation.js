const validator = require('validator');

const validateRegister = (req, res, next) => {
  const { username, email, password } = req.body;
  const errors = [];

  if (!username || username.trim().length < 3) errors.push('Username must be at least 3 characters');
  if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) errors.push('Username can only contain letters, numbers, underscores and hyphens');
  if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(', '), errors });
  }
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !validator.isEmail(email)) errors.push('Valid email is required');
  if (!password) errors.push('Password is required');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(', '), errors });
  }
  next();
};

const sanitize = (req, res, next) => {
  const sanitizeObj = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove MongoDB operators
        if (key.startsWith('$')) { delete obj[key]; continue; }
        obj[key] = obj[key].replace(/\0/g, '');
      } else if (typeof obj[key] === 'object') {
        sanitizeObj(obj[key]);
      }
    }
    return obj;
  };
  req.body = sanitizeObj(req.body);
  next();
};

module.exports = { validateRegister, validateLogin, sanitize };
