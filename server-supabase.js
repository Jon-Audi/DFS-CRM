require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key-in-production';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

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

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, data.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get employee record for this user if they're not admin
    let employeeId = null;
    if (data.role === 'user') {
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('name', data.name)
        .eq('active', 1)
        .single();
      
      if (employee) {
        employeeId = employee.id;
      }
    }

    const token = jwt.sign(
      { id: data.id, username: data.username, role: data.role, employeeId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: { 
        id: data.id, 
        username: data.username, 
        name: data.name, 
        role: data.role,
        employeeId 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    const hashedPassword = bcrypt.hashSync(password, 10);

    const { error } = await supabase
      .from('users')
      .insert([{
        username,
        password: hashedPassword,
        name,
        role: role || 'user'
      }]);

    if (error) {
      return res.status(400).json({ error: 'User already exists or invalid data' });
    }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ============================================
// COMPANY ROUTES
// ============================================

app.get('/companies', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch companies' });
  }
});

app.post('/companies', authenticateToken, async (req, res) => {
  try {
    const { id, name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date } = req.body;

    const { error } = await supabase
      .from('companies')
      .insert([{
        id,
        name,
        type,
        contact_name: contact_name || null,
        address,
        city,
        state,
        zip,
        phone,
        email,
        website,
        notes,
        is_customer: is_customer ? 1 : 0,
        last_order_date: last_order_date || null,
        last_estimate_date: last_estimate_date || null
      }]);

    if (error) throw error;
    res.status(201).json({ message: 'Company created', id });
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: err.message || 'Failed to create company' });
  }
});

app.put('/companies/:id', authenticateToken, async (req, res) => {
  try {
    const { name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date } = req.body;

    const { error } = await supabase
      .from('companies')
      .update({
        name,
        type,
        contact_name: contact_name || null,
        address,
        city,
        state,
        zip,
        phone,
        email,
        website,
        notes,
        is_customer: is_customer ? 1 : 0,
        last_order_date: last_order_date || null,
        last_estimate_date: last_estimate_date || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Company updated' });
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: err.message || 'Failed to update company' });
  }
});

app.delete('/companies/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Company deleted' });
  } catch (err) {
    console.error('Error deleting company:', err);
    res.status(500).json({ error: err.message || 'Failed to delete company' });
  }
});

// ============================================
// EMPLOYEE ROUTES
// ============================================

app.get('/employees', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch employees' });
  }
});

app.post('/employees', authenticateToken, async (req, res) => {
  try {
    const { id, name, role, active, username, password } = req.body;

    // Create user account if username and password provided
    if (username && password) {
      // Check if username exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);
      const { error: userError } = await supabase
        .from('users')
        .insert([{
          username,
          password: hashedPassword,
          name,
          role: 'user'
        }]);

      if (userError) throw userError;
    }

    // Create employee record
    const { error } = await supabase
      .from('employees')
      .insert([{ id, name, role, active: active !== false ? 1 : 0 }]);

    if (error) throw error;
    res.status(201).json({ message: 'Employee created', id });
  } catch (err) {
    console.error('Error creating employee:', err);
    res.status(500).json({ error: err.message || 'Failed to create employee' });
  }
});

app.put('/employees/:id', authenticateToken, async (req, res) => {
  try {
    const { name, role, active } = req.body;

    const { error } = await supabase
      .from('employees')
      .update({
        name,
        role,
        active: active !== false ? 1 : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Employee updated' });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ error: err.message || 'Failed to update employee' });
  }
});

app.delete('/employees/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ error: err.message || 'Failed to delete employee' });
  }
});

// ============================================
// ACTIVITY ROUTES
// ============================================

app.get('/activities', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching activities:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch activities' });
  }
});

app.post('/activities', authenticateToken, async (req, res) => {
  try {
    const { id, company_id, employee_id, type, answered, interested, follow_up, notes, date } = req.body;

    const { error } = await supabase
      .from('activities')
      .insert([{
        id,
        company_id,
        employee_id,
        type,
        answered: answered ? 1 : 0,
        interested: interested ? 1 : 0,
        follow_up: follow_up ? 1 : 0,
        notes,
        date
      }]);

    if (error) throw error;
    res.status(201).json({ message: 'Activity created', id });
  } catch (err) {
    console.error('Error creating activity:', err);
    res.status(500).json({ error: err.message || 'Failed to create activity' });
  }
});

app.delete('/activities/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Activity deleted' });
  } catch (err) {
    console.error('Error deleting activity:', err);
    res.status(500).json({ error: err.message || 'Failed to delete activity' });
  }
});

// ============================================
// STATS ROUTE
// ============================================

app.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { data: companies } = await supabase
      .from('companies')
      .select('*');

    const { data: activities } = await supabase
      .from('activities')
      .select('*');

    const totalCompanies = companies?.length || 0;
    const contacted = activities?.filter(a => a.answered).length || 0;
    const interested = activities?.filter(a => a.interested).length || 0;
    const needsFollowup = activities?.filter(a => a.follow_up).length || 0;
    const totalCalls = activities?.filter(a => a.type === 'call').length || 0;
    const totalEmails = activities?.filter(a => a.type === 'email').length || 0;

    res.json({
      totalCompanies,
      contacted,
      interested,
      needsFollowup,
      totalCalls,
      totalEmails
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
});

// ============================================
// SERVER START
// ============================================

// Only start server if not in Vercel (serverless environment)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`✓ Access at: http://localhost:${PORT}`);
  });

  process.on('SIGINT', () => {
    console.log('\nServer shutdown gracefully');
    process.exit(0);
  });
}

// Export for Vercel serverless
module.exports = app;
