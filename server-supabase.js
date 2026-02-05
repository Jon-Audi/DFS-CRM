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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Error: JWT_SECRET environment variable is required');
  process.exit(1);
}

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

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const errors = validate([
      { value: username, name: 'Username', rules: ['required'] },
      { value: password, name: 'Password', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

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

    // Get employee record for this user (matched by display name)
    let employeeId = null;
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('name', data.name)
      .eq('active', 1)
      .single();

    if (employee) {
      employeeId = employee.id;
    }

    const token = jwt.sign(
      { id: data.id, username: data.username, name: data.name, role: data.role, employeeId },
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

    const errors = validate([
      { value: username, name: 'Username', rules: ['required', { minLength: 3 }] },
      { value: password, name: 'Password', rules: ['required', { minLength: 6 }] },
      { value: name, name: 'Name', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

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
// USER MANAGEMENT ROUTES (ADMIN ONLY)
// ============================================

app.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    console.log('User requesting /users:', req.user);
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, username, name, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch users' });
  }
});

app.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, name, password } = req.body;
    const userId = req.params.id;

    // Build update object
    const updateData = { name };

    // If username is being changed, check for duplicates
    if (username) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      updateData.username = username;
    }

    // If password is being changed, hash it
    if (password) {
      updateData.password = bcrypt.hashSync(password, 10);
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) throw error;
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: err.message || 'Failed to update user' });
  }
});

app.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = req.params.id;

    // Don't allow deleting the admin user (id=1)
    if (userId === '1') {
      return res.status(400).json({ error: 'Cannot delete admin user' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});

// Activity Logs - Get recent activity
app.get('/activity-logs', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        id,
        action_type,
        entity_type,
        entity_id,
        details,
        created_at,
        users (username, name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch activity logs' });
  }
});

// Helper function to log activity
async function logActivity(userId, actionType, entityType, entityId, details) {
  try {
    await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        details: details
      });
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

// Export Companies as CSV
app.get('/export/companies', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    // Generate CSV
    const headers = ['ID', 'Name', 'Contact Name', 'Phone', 'Email', 'Address', 'City', 'State', 'Zip', 'Type', 'Status', 'Is Customer', 'Notes', 'Created At'];
    const csvRows = [headers.join(',')];

    data.forEach(company => {
      const row = [
        company.id,
        `"${(company.name || '').replace(/"/g, '""')}"`,
        `"${(company.contact_name || '').replace(/"/g, '""')}"`,
        `"${(company.phone || '').replace(/"/g, '""')}"`,
        `"${(company.email || '').replace(/"/g, '""')}"`,
        `"${(company.address || '').replace(/"/g, '""')}"`,
        `"${(company.city || '').replace(/"/g, '""')}"`,
        `"${(company.state || '').replace(/"/g, '""')}"`,
        `"${(company.zip || '').replace(/"/g, '""')}"`,
        `"${(company.type || '').replace(/"/g, '""')}"`,
        `"${(company.status || '').replace(/"/g, '""')}"`,
        company.is_customer ? 'Yes' : 'No',
        `"${(company.notes || '').replace(/"/g, '""')}"`,
        company.created_at
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="companies-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

    await logActivity(req.user.id, 'EXPORT', 'companies', null, 'Exported companies to CSV');
  } catch (err) {
    console.error('Error exporting companies:', err);
    res.status(500).json({ error: err.message || 'Failed to export companies' });
  }
});

// Export Employees as CSV
app.get('/export/employees', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('employees')
      .select('*, users (username)')
      .order('name', { ascending: true });

    if (error) throw error;

    // Generate CSV
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Position', 'Username', 'Created At'];
    const csvRows = [headers.join(',')];

    data.forEach(employee => {
      const row = [
        employee.id,
        `"${(employee.name || '').replace(/"/g, '""')}"`,
        `"${(employee.email || '').replace(/"/g, '""')}"`,
        `"${(employee.phone || '').replace(/"/g, '""')}"`,
        `"${(employee.position || '').replace(/"/g, '""')}"`,
        `"${(employee.users?.username || '').replace(/"/g, '""')}"`,
        employee.created_at
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

    await logActivity(req.user.id, 'EXPORT', 'employees', null, 'Exported employees to CSV');
  } catch (err) {
    console.error('Error exporting employees:', err);
    res.status(500).json({ error: err.message || 'Failed to export employees' });
  }
});

// Get Call Script
app.get('/settings/script', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'call_script')
      .single();

    if (error) {
      // Return default script if not found
      return res.json({
        company: "Delaware Fence Solutions",
        introduction: "Hi, this is [Your Name] from Delaware Fence Solutions. We're a local fence company specializing in high-quality installations for contractors and property managers.",
        opening: "I'm reaching out because we work with contractors like [Company Name] to provide reliable fencing solutions for your projects.",
        products: [
          { name: "Vinyl Fencing", description: "Low maintenance, 20+ year warranty" },
          { name: "Wood Fencing", description: "Cedar and pine options, custom designs" },
          { name: "Chain Link", description: "Commercial grade, galvanized" },
          { name: "Aluminum", description: "Decorative and pool code compliant" },
          { name: "Tools & Materials", description: "Gates, posts, hardware, repair kits" }
        ],
        value_prop: "We offer competitive contractor pricing, quick turnaround times, and we handle everything from permits to installation.",
        questions: [
          "Do you currently work with any fence suppliers?",
          "What types of fencing projects do you typically handle?",
          "Would you be interested in learning about our contractor discount program?"
        ],
        cta: "I'd love to schedule a brief meeting to show you our product catalog and discuss how we can support your upcoming projects. Would next week work for you?"
      });
    }

    res.json(JSON.parse(data.value));
  } catch (err) {
    console.error('Error fetching script:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch script' });
  }
});

// Update Call Script (Admin only)
app.put('/settings/script', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const scriptData = req.body;

    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'call_script',
        value: JSON.stringify(scriptData),
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    await logActivity(req.user.id, 'UPDATE', 'settings', null, 'Updated call script');
    res.json({ message: 'Script updated successfully' });
  } catch (err) {
    console.error('Error updating script:', err);
    res.status(500).json({ error: err.message || 'Failed to update script' });
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

    const errors = validate([
      { value: name, name: 'Company name', rules: ['required'] },
      { value: email, name: 'Email', rules: ['email'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

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
    await logActivity(req.user.id, 'CREATE', 'company', id, `Created company: ${name}`);
    res.status(201).json({ message: 'Company created', id });
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({ error: err.message || 'Failed to create company' });
  }
});

app.put('/companies/:id', authenticateToken, async (req, res) => {
  try {
    const { name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date } = req.body;

    const errors = validate([
      { value: name, name: 'Company name', rules: ['required'] },
      { value: email, name: 'Email', rules: ['email'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

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
    await logActivity(req.user.id, 'UPDATE', 'company', req.params.id, `Updated company: ${name}`);
    res.json({ message: 'Company updated' });
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: err.message || 'Failed to update company' });
  }
});

app.delete('/companies/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Verify company exists before deleting
    const { data: existing } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', req.params.id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    await logActivity(req.user.id, 'DELETE', 'company', req.params.id, `Deleted company: ${existing.name}`);
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

    const errors = validate([
      { value: name, name: 'Employee name', rules: ['required'] }
    ]);
    if (username || password) {
      errors.push(...validate([
        { value: username, name: 'Username', rules: ['required', { minLength: 3 }] },
        { value: password, name: 'Password', rules: ['required', { minLength: 6 }] }
      ]));
    }
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    let createdUsername = null;

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
      createdUsername = username;
    }

    // Create employee record
    const { error } = await supabase
      .from('employees')
      .insert([{ id, name, role, active: active !== false ? 1 : 0 }]);

    if (error) {
      // Rollback: delete the user we just created if employee insert fails
      if (createdUsername) {
        await supabase.from('users').delete().eq('username', createdUsername);
      }
      throw error;
    }

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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Verify employee exists and get their name for user account cleanup
    const { data: existing } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', req.params.id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Clean up associated user account (matched by name)
    await supabase
      .from('users')
      .delete()
      .eq('name', existing.name)
      .eq('role', 'user');

    await logActivity(req.user.id, 'DELETE', 'employee', req.params.id, `Deleted employee: ${existing.name}`);
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

    const errors = validate([
      { value: company_id, name: 'Company', rules: ['required'] },
      { value: employee_id, name: 'Employee', rules: ['required'] },
      { value: type, name: 'Activity type', rules: ['required', 'activityType'] },
      { value: date, name: 'Date', rules: ['required'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

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
// SPA FALLBACK ROUTE
// ============================================
// Serve index.html for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

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
