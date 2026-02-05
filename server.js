require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Error: JWT_SECRET environment variable is required');
  process.exit(1);
}

// Initialize Database
const db = new Database(process.env.DB_PATH || 'crm.db');
db.pragma('journal_mode = WAL'); // Better performance

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Input validation helper
function validate(fields) {
  const errors = [];
  for (const { value, name, rules } of fields) {
    for (const rule of rules) {
      if (rule === 'required' && (!value || (typeof value === 'string' && !value.trim()))) {
        errors.push(`${name} is required`);
      }
      if (typeof rule === 'object' && rule.minLength && typeof value === 'string' && value.trim().length < rule.minLength) {
        errors.push(`${name} must be at least ${rule.minLength} characters`);
      }
      if (rule === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`${name} must be a valid email`);
      }
      if (rule === 'activityType' && value && !['call', 'email'].includes(value)) {
        errors.push(`${name} must be 'call' or 'email'`);
      }
    }
  }
  return errors;
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    const errors = validate([
      { value: username, name: 'Username', rules: ['required', { minLength: 3 }] },
      { value: password, name: 'Password', rules: ['required', { minLength: 6 }] },
      { value: name, name: 'Name', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const hashedPassword = await bcrypt.hash(password, 10);

    const stmt = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(username, hashedPassword, name, role || 'user');

    res.status(201).json({ 
      message: 'User registered successfully',
      userId: result.lastInsertRowid 
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const errors = validate([
      { value: username, name: 'Username', rules: ['required'] },
      { value: password, name: 'Password', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// ============================================
// COMPANIES ROUTES
// ============================================

app.get('/api/companies', authenticateToken, (req, res) => {
  try {
    const companies = db.prepare('SELECT * FROM companies ORDER BY name').all();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

app.get('/api/companies/:id', authenticateToken, (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

app.post('/api/companies', authenticateToken, (req, res) => {
  try {
    const { id, name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date } = req.body;

    const errors = validate([
      { value: name, name: 'Company name', rules: ['required'] },
      { value: email, name: 'Email', rules: ['email'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const stmt = db.prepare(`
      INSERT INTO companies (id, name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, name, type, contact_name || null, address, city, state, zip, phone, email, website, notes, is_customer || 0, last_order_date || null, last_estimate_date || null);
    
    res.status(201).json({ message: 'Company created', id });
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: err.message || 'Failed to create company' });
  }
});

app.put('/api/companies/:id', authenticateToken, (req, res) => {
  try {
    const { name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date } = req.body;

    const errors = validate([
      { value: name, name: 'Company name', rules: ['required'] },
      { value: email, name: 'Email', rules: ['email'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const stmt = db.prepare(`
      UPDATE companies 
      SET name = ?, type = ?, contact_name = ?, address = ?, city = ?, state = ?, zip = ?, 
          phone = ?, email = ?, website = ?, notes = ?, is_customer = ?, 
          last_order_date = ?, last_estimate_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(name, type, contact_name || null, address, city, state, zip, phone, email, website, notes, is_customer || 0, last_order_date || null, last_estimate_date || null, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json({ message: 'Company updated' });
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: err.message || 'Failed to update company' });
  }
});

app.delete('/api/companies/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM companies WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json({ message: 'Company deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// ============================================
// EMPLOYEES ROUTES
// ============================================

app.get('/api/employees', authenticateToken, (req, res) => {
  try {
    const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
    res.json(employees.map(e => ({ ...e, active: Boolean(e.active) })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

app.post('/api/employees', authenticateToken, (req, res) => {
  try {
    const { id, name, role, active } = req.body;

    const errors = validate([
      { value: name, name: 'Employee name', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const stmt = db.prepare('INSERT INTO employees (id, name, role, active) VALUES (?, ?, ?, ?)');
    stmt.run(id, name, role, active ? 1 : 0);
    
    res.status(201).json({ message: 'Employee created', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

app.put('/api/employees/:id', authenticateToken, (req, res) => {
  try {
    const { name, role, active } = req.body;
    
    const stmt = db.prepare(`
      UPDATE employees 
      SET name = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(name, role, active ? 1 : 0, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

app.delete('/api/employees/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// ============================================
// ACTIVITIES ROUTES
// ============================================

app.get('/api/activities', authenticateToken, (req, res) => {
  try {
    const activities = db.prepare('SELECT * FROM activities ORDER BY date DESC').all();
    res.json(activities.map(a => ({
      ...a,
      answered: Boolean(a.answered),
      interested: Boolean(a.interested),
      follow_up: Boolean(a.follow_up)
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.post('/api/activities', authenticateToken, (req, res) => {
  try {
    const { id, company_id, employee_id, type, answered, interested, follow_up, notes, date } = req.body;

    const errors = validate([
      { value: company_id, name: 'Company', rules: ['required'] },
      { value: employee_id, name: 'Employee', rules: ['required'] },
      { value: type, name: 'Activity type', rules: ['required', 'activityType'] },
      { value: date, name: 'Date', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const stmt = db.prepare(`
      INSERT INTO activities (id, company_id, employee_id, type, answered, interested, follow_up, notes, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, company_id, employee_id, type,
      answered ? 1 : 0,
      interested ? 1 : 0,
      follow_up ? 1 : 0,
      notes, date
    );
    
    res.status(201).json({ message: 'Activity created', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

app.put('/api/activities/:id', authenticateToken, (req, res) => {
  try {
    const { type, answered, interested, follow_up, notes } = req.body;
    
    const stmt = db.prepare(`
      UPDATE activities 
      SET type = ?, answered = ?, interested = ?, follow_up = ?, notes = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(
      type,
      answered ? 1 : 0,
      interested ? 1 : 0,
      follow_up ? 1 : 0,
      notes,
      req.params.id
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ message: 'Activity updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

app.delete('/api/activities/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM activities WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ message: 'Activity deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// ============================================
// STATISTICS
// ============================================

app.get('/api/stats', authenticateToken, (req, res) => {
  try {
    const stats = {
      totalCompanies: db.prepare('SELECT COUNT(*) as count FROM companies').get().count,
      totalEmployees: db.prepare('SELECT COUNT(*) as count FROM employees WHERE active = 1').get().count,
      totalActivities: db.prepare('SELECT COUNT(*) as count FROM activities').get().count,
      totalCalls: db.prepare('SELECT COUNT(*) as count FROM activities WHERE type = "call"').get().count,
      totalEmails: db.prepare('SELECT COUNT(*) as count FROM activities WHERE type = "email"').get().count,
      contacted: db.prepare('SELECT COUNT(*) as count FROM activities WHERE answered = 1').get().count,
      interested: db.prepare('SELECT COUNT(*) as count FROM activities WHERE interested = 1').get().count,
      needsFollowup: db.prepare('SELECT COUNT(*) as count FROM activities WHERE follow_up = 1').get().count,
    };
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Access at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  console.log('\nServer shutdown gracefully');
  process.exit(0);
});
