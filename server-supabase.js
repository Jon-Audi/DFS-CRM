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

// Initialize Firebase Admin (for invoice app integration)
let firestore = null;
try {
  const admin = require('firebase-admin');
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firestore = admin.firestore();
    console.log('✅ Firebase Admin initialized for invoice integration');
  } else {
    console.log('ℹ️ FIREBASE_SERVICE_ACCOUNT not set - invoice integration disabled');
  }
} catch (err) {
  console.error('⚠️ Firebase Admin init error (invoice integration disabled):', err.message);
}

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
    const { name, type, contact_name, address, city, state, zip, phone, email, website, notes, is_customer, last_order_date, last_estimate_date, tags, follow_up_date, follow_up_note } = req.body;

    const errors = validate([
      { value: name, name: 'Company name', rules: ['required'] },
      { value: email, name: 'Email', rules: ['email'] }
    ]);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const updateData = {
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
    };

    // Include new fields if provided
    if (tags !== undefined) updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
    if (follow_up_date !== undefined) updateData.follow_up_date = follow_up_date || null;
    if (follow_up_note !== undefined) updateData.follow_up_note = follow_up_note || null;

    const { error } = await supabase
      .from('companies')
      .update(updateData)
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
// COMPANY SUB-ROUTES (Notes, Tags, Follow-ups)
// ============================================

// Add a note to a company
app.post('/companies/:id/notes', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    // Get current company notes
    const { data: company, error: fetchErr } = await supabase
      .from('companies')
      .select('notes')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    // Parse existing notes: if JSON array, use it; otherwise migrate plain text
    let notesArr = [];
    const raw = company.notes || '';
    if (raw.trim().startsWith('[')) {
      try { notesArr = JSON.parse(raw); } catch (e) { notesArr = []; }
    } else if (raw.trim()) {
      // Migrate legacy plain text as first entry
      notesArr = [{ id: 'legacy_1', author: 'System', text: raw, timestamp: company.created_at || new Date().toISOString() }];
    }

    // Prepend new note
    const newNote = {
      id: `note_${Date.now()}`,
      author: req.user.name || req.user.username,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };
    notesArr.unshift(newNote);

    const { error } = await supabase
      .from('companies')
      .update({ notes: JSON.stringify(notesArr), updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ note: newNote, notes: notesArr });
  } catch (err) {
    console.error('Error adding note:', err);
    res.status(500).json({ error: err.message || 'Failed to add note' });
  }
});

// Update company tags
app.put('/companies/:id/tags', authenticateToken, async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }

    const { error } = await supabase
      .from('companies')
      .update({ tags: JSON.stringify(tags), updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Tags updated', tags });
  } catch (err) {
    console.error('Error updating tags:', err);
    res.status(500).json({ error: err.message || 'Failed to update tags' });
  }
});

// Update company follow-up reminder
app.put('/companies/:id/follow-up', authenticateToken, async (req, res) => {
  try {
    const { follow_up_date, follow_up_note } = req.body;

    const { error } = await supabase
      .from('companies')
      .update({
        follow_up_date: follow_up_date || null,
        follow_up_note: follow_up_note || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Follow-up updated' });
  } catch (err) {
    console.error('Error updating follow-up:', err);
    res.status(500).json({ error: err.message || 'Failed to update follow-up' });
  }
});

// Get all follow-ups
app.get('/follow-ups', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, type, follow_up_date, follow_up_note')
      .not('follow_up_date', 'is', null)
      .order('follow_up_date', { ascending: true });

    if (error) throw error;

    const now = new Date().toISOString().split('T')[0];
    const overdue = (data || []).filter(c => c.follow_up_date && c.follow_up_date.split('T')[0] < now);
    const upcoming = (data || []).filter(c => c.follow_up_date && c.follow_up_date.split('T')[0] >= now);

    res.json({ overdue, upcoming });
  } catch (err) {
    console.error('Error fetching follow-ups:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch follow-ups' });
  }
});

// Get all unique tags
app.get('/tags', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('tags');

    if (error) throw error;

    const allTags = new Set();
    (data || []).forEach(c => {
      try {
        const parsed = JSON.parse(c.tags || '[]');
        parsed.forEach(t => allTags.add(t));
      } catch (e) {}
    });

    res.json([...allTags].sort());
  } catch (err) {
    console.error('Error fetching tags:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch tags' });
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
// ============================================
// INVOICE APP INTEGRATION ROUTES
// ============================================

// Search invoice app customers (match by name)
app.get('/integrations/invoice-customers', authenticateToken, async (req, res) => {
  try {
    if (!firestore) return res.status(503).json({ error: 'Invoice integration not configured' });

    const { search } = req.query;
    const snapshot = await firestore.collection('customers').get();
    const customers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
      const companyName = data.companyName || '';

      // If search provided, filter
      if (search) {
        const s = search.toLowerCase();
        if (!fullName.toLowerCase().includes(s) && !companyName.toLowerCase().includes(s)) return;
      }

      customers.push({
        id: doc.id,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        phone: data.phone,
        customerType: data.customerType,
        emailContacts: data.emailContacts || [],
        address: data.address
      });
    });

    res.json(customers);
  } catch (err) {
    console.error('Error fetching invoice customers:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch invoice customers' });
  }
});

// Get estimates and invoices for a specific invoice-app customer
app.get('/integrations/customer-data/:customerId', authenticateToken, async (req, res) => {
  try {
    if (!firestore) return res.status(503).json({ error: 'Invoice integration not configured' });

    const { customerId } = req.params;

    // Get estimates for this customer
    const estSnapshot = await firestore.collection('estimates')
      .where('customerId', '==', customerId)
      .get();

    const estimates = [];
    estSnapshot.forEach(doc => {
      const d = doc.data();
      estimates.push({
        id: doc.id,
        estimateNumber: d.estimateNumber,
        date: d.date,
        status: d.status,
        total: d.total,
        validUntil: d.validUntil
      });
    });

    // Get invoices for this customer
    const invSnapshot = await firestore.collection('invoices')
      .where('customerId', '==', customerId)
      .get();

    const invoices = [];
    invSnapshot.forEach(doc => {
      const d = doc.data();
      invoices.push({
        id: doc.id,
        invoiceNumber: d.invoiceNumber,
        date: d.date,
        dueDate: d.dueDate,
        status: d.status,
        total: d.total,
        amountPaid: d.amountPaid,
        balanceDue: d.balanceDue
      });
    });

    // Sort by date descending
    estimates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.json({ estimates, invoices });
  } catch (err) {
    console.error('Error fetching customer data:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch customer data' });
  }
});

// Auto-match a CRM company to an invoice-app customer and return data
app.get('/integrations/match/:companyId', authenticateToken, async (req, res) => {
  try {
    if (!firestore) return res.status(503).json({ error: 'Invoice integration not configured' });

    // Get the CRM company
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', req.params.companyId)
      .single();
    if (compErr) throw compErr;

    // If already linked, use the saved customer ID directly
    if (company.invoice_customer_id) {
      const custDoc = await firestore.collection('customers').doc(company.invoice_customer_id).get();
      if (custDoc.exists) {
        const custData = custDoc.data();
        const customerId = company.invoice_customer_id;

        const [estSnap, invSnap] = await Promise.all([
          firestore.collection('estimates').where('customerId', '==', customerId).get(),
          firestore.collection('invoices').where('customerId', '==', customerId).get()
        ]);

        const estimates = [];
        estSnap.forEach(doc => {
          const d = doc.data();
          estimates.push({ id: doc.id, estimateNumber: d.estimateNumber, date: d.date, status: d.status, total: d.total });
        });
        const invoices = [];
        invSnap.forEach(doc => {
          const d = doc.data();
          invoices.push({ id: doc.id, invoiceNumber: d.invoiceNumber, date: d.date, dueDate: d.dueDate, status: d.status, total: d.total, amountPaid: d.amountPaid, balanceDue: d.balanceDue });
        });

        estimates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const totalEstimates = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
        const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
        const totalPaid = invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
        const totalOutstanding = invoices.reduce((sum, i) => sum + (i.balanceDue || 0), 0);

        return res.json({
          matched: true,
          matchScore: 100,
          linked: true,
          customer: {
            id: customerId,
            name: [custData.firstName, custData.lastName].filter(Boolean).join(' '),
            companyName: custData.companyName,
            customerType: custData.customerType
          },
          estimates,
          invoices,
          summary: {
            totalEstimates, totalInvoiced, totalPaid, totalOutstanding,
            estimateCount: estimates.length, invoiceCount: invoices.length,
            latestEstimateDate: estimates[0]?.date || null,
            latestInvoiceDate: invoices[0]?.date || null
          }
        });
      }
    }

    // Search invoice app customers for a match
    const snapshot = await firestore.collection('customers').get();
    let match = null;
    let matchScore = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const companyName = (data.companyName || '').toLowerCase().trim();
      const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ').toLowerCase().trim();
      const crmName = (company.name || '').toLowerCase().trim();
      const crmContact = (company.contact_name || '').toLowerCase().trim();

      let score = 0;

      // Exact company name match
      if (companyName && crmName && companyName === crmName) score = 100;
      // Company name contains or is contained
      else if (companyName && crmName && (companyName.includes(crmName) || crmName.includes(companyName))) score = 80;
      // Contact name matches
      else if (fullName && crmContact && fullName === crmContact) score = 70;
      // Phone match
      else if (data.phone && company.phone) {
        const p1 = data.phone.replace(/\D/g, '').slice(-10);
        const p2 = company.phone.replace(/\D/g, '').slice(-10);
        if (p1 && p2 && p1 === p2) score = 90;
      }

      if (score > matchScore) {
        matchScore = score;
        match = { id: doc.id, ...data, matchScore: score };
      }
    });

    if (!match || matchScore < 60) {
      return res.json({ matched: false, company: company.name });
    }

    // Get estimates and invoices for matched customer
    const [estSnap, invSnap] = await Promise.all([
      firestore.collection('estimates').where('customerId', '==', match.id).get(),
      firestore.collection('invoices').where('customerId', '==', match.id).get()
    ]);

    const estimates = [];
    estSnap.forEach(doc => {
      const d = doc.data();
      estimates.push({ id: doc.id, estimateNumber: d.estimateNumber, date: d.date, status: d.status, total: d.total });
    });

    const invoices = [];
    invSnap.forEach(doc => {
      const d = doc.data();
      invoices.push({ id: doc.id, invoiceNumber: d.invoiceNumber, date: d.date, dueDate: d.dueDate, status: d.status, total: d.total, amountPaid: d.amountPaid, balanceDue: d.balanceDue });
    });

    estimates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Calculate totals
    const totalEstimates = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalPaid = invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
    const totalOutstanding = invoices.reduce((sum, i) => sum + (i.balanceDue || 0), 0);

    // Get latest dates for syncing
    const latestEstimateDate = estimates.length > 0 ? estimates[0].date : null;
    const latestInvoiceDate = invoices.length > 0 ? invoices[0].date : null;

    res.json({
      matched: true,
      matchScore,
      customer: {
        id: match.id,
        name: [match.firstName, match.lastName].filter(Boolean).join(' '),
        companyName: match.companyName,
        customerType: match.customerType
      },
      estimates,
      invoices,
      summary: {
        totalEstimates,
        totalInvoiced,
        totalPaid,
        totalOutstanding,
        estimateCount: estimates.length,
        invoiceCount: invoices.length,
        latestEstimateDate,
        latestInvoiceDate
      }
    });
  } catch (err) {
    console.error('Error matching company:', err);
    res.status(500).json({ error: err.message || 'Failed to match company' });
  }
});

// Sync dates from invoice app to CRM company
app.post('/integrations/sync/:companyId', authenticateToken, async (req, res) => {
  try {
    const { last_estimate_date, last_order_date } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (last_estimate_date) updates.last_estimate_date = last_estimate_date;
    if (last_order_date) updates.last_order_date = last_order_date;

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', req.params.companyId);
    if (error) throw error;

    res.json({ message: 'Dates synced successfully' });
  } catch (err) {
    console.error('Error syncing dates:', err);
    res.status(500).json({ error: err.message || 'Failed to sync dates' });
  }
});

// Bulk match all invoice customers to CRM companies
app.get('/integrations/bulk-match', authenticateToken, async (req, res) => {
  try {
    if (!firestore) return res.status(503).json({ error: 'Invoice integration not configured' });

    // Get all CRM companies
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id, name, contact_name, phone, invoice_customer_id');
    if (compErr) throw compErr;

    // Get all invoice app customers
    const snapshot = await firestore.collection('customers').get();
    const invoiceCustomers = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      invoiceCustomers.push({
        id: doc.id,
        firstName: d.firstName,
        lastName: d.lastName,
        companyName: d.companyName || '',
        phone: d.phone || '',
        customerType: d.customerType,
        name: [d.firstName, d.lastName].filter(Boolean).join(' ')
      });
    });

    // Build results: for each invoice customer, find best CRM match
    const results = invoiceCustomers.map(ic => {
      // Check if already linked
      const linkedCompany = companies.find(c => c.invoice_customer_id === ic.id);
      if (linkedCompany) {
        return {
          invoiceCustomer: ic,
          match: { id: linkedCompany.id, name: linkedCompany.name },
          score: 100,
          status: 'linked'
        };
      }

      // Try to auto-match
      let bestMatch = null;
      let bestScore = 0;

      companies.forEach(c => {
        // Skip already linked companies
        if (c.invoice_customer_id) return;

        const crmName = (c.name || '').toLowerCase().trim();
        const crmContact = (c.contact_name || '').toLowerCase().trim();
        const icCompany = (ic.companyName || '').toLowerCase().trim();
        const icName = (ic.name || '').toLowerCase().trim();

        let score = 0;

        // Exact company name match
        if (icCompany && crmName && icCompany === crmName) score = 100;
        // Company name contains or is contained
        else if (icCompany && crmName && (icCompany.includes(crmName) || crmName.includes(icCompany))) score = 80;
        // Contact name matches invoice customer name
        else if (icName && crmContact && icName === crmContact) score = 70;
        // Contact name matches company name (for sole proprietors)
        else if (icName && crmName && icName === crmName) score = 75;
        // Phone match
        if (ic.phone && c.phone) {
          const p1 = ic.phone.replace(/\D/g, '').slice(-10);
          const p2 = c.phone.replace(/\D/g, '').slice(-10);
          if (p1 && p2 && p1 === p2) score = Math.max(score, 90);
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { id: c.id, name: c.name };
        }
      });

      return {
        invoiceCustomer: ic,
        match: bestMatch,
        score: bestScore,
        status: bestScore >= 70 ? 'suggested' : 'unmatched'
      };
    });

    // Sort: suggested first, then unmatched, then linked
    const order = { suggested: 0, unmatched: 1, linked: 2 };
    results.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.score - a.score);

    res.json({ results, crmCompanies: companies.map(c => ({ id: c.id, name: c.name, invoice_customer_id: c.invoice_customer_id })) });
  } catch (err) {
    console.error('Error bulk matching:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk match' });
  }
});

// Link an invoice customer to a CRM company (with auto-enrich)
app.post('/integrations/link', authenticateToken, async (req, res) => {
  try {
    const { companyId, invoiceCustomerId } = req.body;
    if (!companyId || !invoiceCustomerId) return res.status(400).json({ error: 'companyId and invoiceCustomerId required' });

    // Get current CRM company data
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (compErr) throw compErr;

    const updates = {
      invoice_customer_id: invoiceCustomerId,
      updated_at: new Date().toISOString()
    };

    // Get the invoice customer data
    if (firestore) {
      const custDoc = await firestore.collection('customers').doc(invoiceCustomerId).get();
      if (custDoc.exists) {
        const custData = custDoc.data();

        // Auto-fill missing contact info from invoice customer
        if (!company.phone && custData.phone) updates.phone = custData.phone;
        if (!company.email && custData.emailContacts?.length > 0) updates.email = custData.emailContacts[0].email || custData.emailContacts[0];
        if (!company.contact_name) {
          const name = [custData.firstName, custData.lastName].filter(Boolean).join(' ');
          if (name) updates.contact_name = name;
        }
        if (!company.address && custData.address) {
          if (custData.address.street) updates.address = custData.address.street;
          if (custData.address.city && !company.city) updates.city = custData.address.city;
          if (custData.address.state && !company.state) updates.state = custData.address.state;
          if (custData.address.zip && !company.zip) updates.zip = custData.address.zip;
        }
      }

      // Check for invoices/estimates and auto-sync dates + type
      const [estSnap, invSnap] = await Promise.all([
        firestore.collection('estimates').where('customerId', '==', invoiceCustomerId).get(),
        firestore.collection('invoices').where('customerId', '==', invoiceCustomerId).get()
      ]);

      // Find latest estimate date
      let latestEstDate = null;
      estSnap.forEach(doc => {
        const d = doc.data().date;
        if (d && (!latestEstDate || d > latestEstDate)) latestEstDate = d;
      });
      if (latestEstDate) updates.last_estimate_date = latestEstDate;

      // Find latest invoice date
      let latestInvDate = null;
      invSnap.forEach(doc => {
        const d = doc.data().date;
        if (d && (!latestInvDate || d > latestInvDate)) latestInvDate = d;
      });
      if (latestInvDate) updates.last_order_date = latestInvDate;

      // Auto-upgrade Prospect → Customer if they have invoices
      if (!invSnap.empty && company.type !== 'Customer') {
        updates.type = 'Customer';
      }
    }

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId);
    if (error) throw error;

    // Build a summary of what was auto-updated
    const autoUpdated = [];
    if (updates.type === 'Customer' && company.type !== 'Customer') autoUpdated.push('type → Customer');
    if (updates.last_order_date) autoUpdated.push('last order date synced');
    if (updates.last_estimate_date) autoUpdated.push('last estimate date synced');
    if (updates.phone && !company.phone) autoUpdated.push('phone added');
    if (updates.email && !company.email) autoUpdated.push('email added');
    if (updates.contact_name && !company.contact_name) autoUpdated.push('contact name added');
    if (updates.city && !company.city) autoUpdated.push('address added');

    res.json({ message: 'Linked successfully', autoUpdated });
  } catch (err) {
    console.error('Error linking:', err);
    res.status(500).json({ error: err.message || 'Failed to link' });
  }
});

// Unlink an invoice customer from a CRM company
app.post('/integrations/unlink', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const { error } = await supabase
      .from('companies')
      .update({ invoice_customer_id: null, updated_at: new Date().toISOString() })
      .eq('id', companyId);
    if (error) throw error;

    res.json({ message: 'Unlinked successfully' });
  } catch (err) {
    console.error('Error unlinking:', err);
    res.status(500).json({ error: err.message || 'Failed to unlink' });
  }
});

// ============================================
// CSV IMPORT ROUTE
// ============================================

app.post('/companies/import', authenticateToken, async (req, res) => {
  try {
    const { companies: importData, skipDuplicates } = req.body;
    if (!importData?.length) {
      return res.status(400).json({ error: 'No companies to import' });
    }

    // Get existing companies for duplicate checking
    let existingNames = new Set();
    if (skipDuplicates) {
      const { data: existing } = await supabase.from('companies').select('name, city');
      (existing || []).forEach(c => {
        existingNames.add(`${(c.name || '').toLowerCase().trim()}|${(c.city || '').toLowerCase().trim()}`);
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];

      if (!row.name || !row.name.trim()) {
        errors.push({ row: i + 1, reason: 'Missing company name' });
        continue;
      }

      // Check for duplicate
      if (skipDuplicates) {
        const key = `${row.name.toLowerCase().trim()}|${(row.city || '').toLowerCase().trim()}`;
        if (existingNames.has(key)) {
          skipped++;
          continue;
        }
        existingNames.add(key);
      }

      const company = {
        id: `company_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: row.name.trim(),
        type: (row.type || 'Other').trim(),
        contact_name: (row.contact_name || '').trim() || null,
        phone: (row.phone || '').trim() || null,
        email: (row.email || '').trim() || null,
        website: (row.website || '').trim() || null,
        address: (row.address || '').trim() || null,
        city: (row.city || '').trim() || null,
        state: (row.state || '').trim() || null,
        zip: (row.zip || '').trim() || null,
        is_customer: row.is_customer === true || row.is_customer === 'Yes' || row.is_customer === 'true',
        tags: row.tags ? JSON.stringify(row.tags.split(';').map(t => t.trim()).filter(Boolean)) : '[]',
        notes: row.notes || '[]'
      };

      const { error } = await supabase.from('companies').insert([company]);
      if (error) {
        errors.push({ row: i + 1, reason: error.message });
      } else {
        imported++;
      }
    }

    res.json({ imported, skipped, errors: errors.slice(0, 10), totalErrors: errors.length });
  } catch (err) {
    console.error('Error importing companies:', err);
    res.status(500).json({ error: err.message || 'Failed to import companies' });
  }
});

// ============================================
// BULK ACTIONS ROUTES
// ============================================

// Bulk add/remove tags
app.post('/companies/bulk/tags', authenticateToken, async (req, res) => {
  try {
    const { companyIds, tags, action } = req.body; // action: 'add' or 'remove'
    if (!companyIds?.length || !tags?.length) {
      return res.status(400).json({ error: 'companyIds and tags are required' });
    }

    const { data: companies, error: fetchErr } = await supabase
      .from('companies')
      .select('id, tags')
      .in('id', companyIds);
    if (fetchErr) throw fetchErr;

    let updated = 0;
    for (const company of companies) {
      let existing = [];
      try { existing = JSON.parse(company.tags || '[]'); } catch (e) { existing = []; }

      let newTags;
      if (action === 'remove') {
        newTags = existing.filter(t => !tags.includes(t));
      } else {
        newTags = [...new Set([...existing, ...tags])];
      }

      const { error } = await supabase
        .from('companies')
        .update({ tags: JSON.stringify(newTags), updated_at: new Date().toISOString() })
        .eq('id', company.id);
      if (!error) updated++;
    }

    res.json({ message: `Updated tags for ${updated} companies` });
  } catch (err) {
    console.error('Error bulk updating tags:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk update tags' });
  }
});

// Bulk set follow-up date
app.post('/companies/bulk/follow-up', authenticateToken, async (req, res) => {
  try {
    const { companyIds, follow_up_date, follow_up_note } = req.body;
    if (!companyIds?.length || !follow_up_date) {
      return res.status(400).json({ error: 'companyIds and follow_up_date are required' });
    }

    const updateData = {
      follow_up_date,
      updated_at: new Date().toISOString()
    };
    if (follow_up_note !== undefined) updateData.follow_up_note = follow_up_note;

    const { error } = await supabase
      .from('companies')
      .update(updateData)
      .in('id', companyIds);
    if (error) throw error;

    res.json({ message: `Set follow-up for ${companyIds.length} companies` });
  } catch (err) {
    console.error('Error bulk setting follow-up:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk set follow-up' });
  }
});

// Bulk export companies to CSV
app.post('/companies/bulk/export', authenticateToken, async (req, res) => {
  try {
    const { companyIds } = req.body;
    if (!companyIds?.length) {
      return res.status(400).json({ error: 'companyIds are required' });
    }

    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .in('id', companyIds);
    if (error) throw error;

    const headers = ['Name', 'Type', 'Contact Name', 'Phone', 'Email', 'Website', 'Address', 'City', 'State', 'Zip', 'Is Customer', 'Tags', 'Follow-up Date', 'Follow-up Note', 'Last Order Date', 'Last Estimate Date'];
    const rows = (companies || []).map(c => {
      let tags = '';
      try { tags = JSON.parse(c.tags || '[]').join('; '); } catch (e) {}
      return [
        c.name, c.type, c.contact_name, c.phone, c.email, c.website,
        c.address, c.city, c.state, c.zip,
        c.is_customer ? 'Yes' : 'No', tags,
        c.follow_up_date || '', c.follow_up_note || '',
        c.last_order_date || '', c.last_estimate_date || ''
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="companies-export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error bulk exporting:', err);
    res.status(500).json({ error: err.message || 'Failed to export companies' });
  }
});

// Bulk delete companies (admin only)
app.post('/companies/bulk/delete', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { companyIds } = req.body;
    if (!companyIds?.length) {
      return res.status(400).json({ error: 'companyIds are required' });
    }

    // Delete related activities first
    await supabase.from('activities').delete().in('company_id', companyIds);

    const { error } = await supabase.from('companies').delete().in('id', companyIds);
    if (error) throw error;

    res.json({ message: `Deleted ${companyIds.length} companies` });
  } catch (err) {
    console.error('Error bulk deleting:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk delete companies' });
  }
});

// ============================================
// REPORTS ROUTES
// ============================================

// Get activity report data with date range
app.get('/reports/activity', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase.from('activities').select('*');

    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    const { data: activities, error } = await query.order('date', { ascending: true });
    if (error) throw error;

    // Group activities by date
    const byDate = {};
    (activities || []).forEach(a => {
      const date = a.date?.split('T')[0] || 'unknown';
      if (!byDate[date]) byDate[date] = { calls: 0, emails: 0, answered: 0, interested: 0 };
      if (a.type === 'call') byDate[date].calls++;
      if (a.type === 'email') byDate[date].emails++;
      if (a.answered) byDate[date].answered++;
      if (a.interested) byDate[date].interested++;
    });

    // Group by week
    const byWeek = {};
    (activities || []).forEach(a => {
      const date = new Date(a.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      if (!byWeek[weekKey]) byWeek[weekKey] = { calls: 0, emails: 0, answered: 0, interested: 0 };
      if (a.type === 'call') byWeek[weekKey].calls++;
      if (a.type === 'email') byWeek[weekKey].emails++;
      if (a.answered) byWeek[weekKey].answered++;
      if (a.interested) byWeek[weekKey].interested++;
    });

    // Group by month
    const byMonth = {};
    (activities || []).forEach(a => {
      const monthKey = a.date?.substring(0, 7) || 'unknown';
      if (!byMonth[monthKey]) byMonth[monthKey] = { calls: 0, emails: 0, answered: 0, interested: 0 };
      if (a.type === 'call') byMonth[monthKey].calls++;
      if (a.type === 'email') byMonth[monthKey].emails++;
      if (a.answered) byMonth[monthKey].answered++;
      if (a.interested) byMonth[monthKey].interested++;
    });

    res.json({ byDate, byWeek, byMonth, total: activities?.length || 0 });
  } catch (err) {
    console.error('Error fetching activity report:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch activity report' });
  }
});

// Get conversion funnel data
app.get('/reports/funnel', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Get all companies
    const { data: companies, error: compErr } = await supabase.from('companies').select('id, is_customer, created_at');
    if (compErr) throw compErr;

    // Get activities with optional date filter
    let actQuery = supabase.from('activities').select('company_id, answered, interested, type');
    if (start_date) actQuery = actQuery.gte('date', start_date);
    if (end_date) actQuery = actQuery.lte('date', end_date);
    const { data: activities, error: actErr } = await actQuery;
    if (actErr) throw actErr;

    // Build sets
    const contactedCompanies = new Set((activities || []).map(a => a.company_id));
    const answeredCompanies = new Set((activities || []).filter(a => a.answered).map(a => a.company_id));
    const interestedCompanies = new Set((activities || []).filter(a => a.interested).map(a => a.company_id));
    const customerCompanies = new Set((companies || []).filter(c => c.is_customer).map(c => c.id));

    res.json({
      totalCompanies: companies?.length || 0,
      contacted: contactedCompanies.size,
      answered: answeredCompanies.size,
      interested: interestedCompanies.size,
      customers: customerCompanies.size
    });
  } catch (err) {
    console.error('Error fetching funnel report:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch funnel report' });
  }
});

// Get employee performance data
app.get('/reports/employees', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Get employees
    const { data: employees, error: empErr } = await supabase.from('employees').select('id, name, active');
    if (empErr) throw empErr;

    // Get activities with optional date filter
    let actQuery = supabase.from('activities').select('employee_id, type, answered, interested, follow_up');
    if (start_date) actQuery = actQuery.gte('date', start_date);
    if (end_date) actQuery = actQuery.lte('date', end_date);
    const { data: activities, error: actErr } = await actQuery;
    if (actErr) throw actErr;

    // Calculate per-employee stats
    const employeeStats = (employees || []).map(emp => {
      const empActivities = (activities || []).filter(a => a.employee_id === emp.id);
      const calls = empActivities.filter(a => a.type === 'call').length;
      const emails = empActivities.filter(a => a.type === 'email').length;
      const answered = empActivities.filter(a => a.answered).length;
      const interested = empActivities.filter(a => a.interested).length;
      const followUps = empActivities.filter(a => a.follow_up).length;

      return {
        id: emp.id,
        name: emp.name,
        active: emp.active,
        calls,
        emails,
        totalActivities: empActivities.length,
        answered,
        interested,
        followUps,
        answerRate: calls > 0 ? Math.round((answered / calls) * 100) : 0,
        interestRate: answered > 0 ? Math.round((interested / answered) * 100) : 0
      };
    });

    // Sort by total activities descending
    employeeStats.sort((a, b) => b.totalActivities - a.totalActivities);

    res.json(employeeStats);
  } catch (err) {
    console.error('Error fetching employee report:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch employee report' });
  }
});

// Get pipeline breakdown
app.get('/reports/pipeline', authenticateToken, async (req, res) => {
  try {
    // Get companies with tags
    const { data: companies, error: compErr } = await supabase.from('companies').select('id, type, tags, is_customer');
    if (compErr) throw compErr;

    // Get activities for status
    const { data: activities, error: actErr } = await supabase.from('activities').select('company_id, interested, follow_up');
    if (actErr) throw actErr;

    // By type
    const byType = {};
    (companies || []).forEach(c => {
      const type = c.type || 'Unknown';
      if (!byType[type]) byType[type] = { total: 0, customers: 0, prospects: 0 };
      byType[type].total++;
      if (c.is_customer) byType[type].customers++;
      else byType[type].prospects++;
    });

    // By tag
    const byTag = {};
    (companies || []).forEach(c => {
      try {
        const tags = JSON.parse(c.tags || '[]');
        tags.forEach(tag => {
          if (!byTag[tag]) byTag[tag] = { total: 0, customers: 0, prospects: 0 };
          byTag[tag].total++;
          if (c.is_customer) byTag[tag].customers++;
          else byTag[tag].prospects++;
        });
      } catch (e) {}
    });

    // By status (based on activities)
    const companyStatuses = {};
    (activities || []).forEach(a => {
      if (!companyStatuses[a.company_id]) companyStatuses[a.company_id] = { contacted: false, interested: false, followUp: false };
      companyStatuses[a.company_id].contacted = true;
      if (a.interested) companyStatuses[a.company_id].interested = true;
      if (a.follow_up) companyStatuses[a.company_id].followUp = true;
    });

    const byStatus = {
      notContacted: 0,
      contacted: 0,
      interested: 0,
      needsFollowUp: 0,
      customers: 0
    };

    (companies || []).forEach(c => {
      if (c.is_customer) {
        byStatus.customers++;
      } else {
        const status = companyStatuses[c.id];
        if (!status) byStatus.notContacted++;
        else if (status.interested) byStatus.interested++;
        else if (status.followUp) byStatus.needsFollowUp++;
        else byStatus.contacted++;
      }
    });

    res.json({ byType, byTag, byStatus });
  } catch (err) {
    console.error('Error fetching pipeline report:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch pipeline report' });
  }
});

// Get user activity dashboard data
app.get('/reports/user-dashboard', authenticateToken, async (req, res) => {
  try {
    const { data: employees, error: empErr } = await supabase.from('employees').select('id, name, active');
    if (empErr) throw empErr;

    const { data: activities, error: actErr } = await supabase.from('activities').select('*').order('date', { ascending: false });
    if (actErr) throw actErr;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const monthStartStr = now.toISOString().substring(0, 7);

    const employeeStats = (employees || []).filter(e => e.active).map(emp => {
      const empActs = (activities || []).filter(a => a.employee_id === emp.id);

      const today = empActs.filter(a => a.date?.startsWith(todayStr));
      const thisWeek = empActs.filter(a => a.date >= weekStartStr);
      const thisMonth = empActs.filter(a => a.date?.startsWith(monthStartStr));

      const countStats = (acts) => ({
        calls: acts.filter(a => a.type === 'call').length,
        emails: acts.filter(a => a.type === 'email').length,
        answered: acts.filter(a => a.answered).length,
        interested: acts.filter(a => a.interested).length
      });

      return {
        id: emp.id,
        name: emp.name,
        today: countStats(today),
        thisWeek: countStats(thisWeek),
        thisMonth: countStats(thisMonth),
        allTime: countStats(empActs),
        recentActivities: empActs.slice(0, 10).map(a => ({
          type: a.type,
          date: a.date,
          answered: a.answered,
          interested: a.interested,
          notes: a.notes,
          company_id: a.company_id
        }))
      };
    });

    // Sort by today's calls desc, then week's calls
    employeeStats.sort((a, b) => b.today.calls - a.today.calls || b.thisWeek.calls - a.thisWeek.calls);

    res.json(employeeStats);
  } catch (err) {
    console.error('Error fetching user dashboard:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch user dashboard' });
  }
});

// ============================================
// DISCOVER ROUTE (Google Places API)
// ============================================

app.get('/discover', authenticateToken, async (req, res) => {
  try {
    const { query, location } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Places API key not configured' });
    }

    const textQuery = location ? `${query} in ${location}` : query;

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.addressComponents'
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 20
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Google Places API error:', errData);
      throw new Error(errData.error?.message || `Google API returned ${response.status}`);
    }

    const data = await response.json();
    const places = (data.places || []).map(place => {
      // Extract address components
      const components = place.addressComponents || [];
      const getComponent = (type) => {
        const comp = components.find(c => c.types?.includes(type));
        return comp ? (comp.shortText || comp.longText || '') : '';
      };

      return {
        google_place_id: place.id,
        name: place.displayName?.text || '',
        address: place.formattedAddress || '',
        street: getComponent('street_number') + (getComponent('street_number') ? ' ' : '') + getComponent('route'),
        city: getComponent('locality') || getComponent('sublocality'),
        state: getComponent('administrative_area_level_1'),
        zip: getComponent('postal_code'),
        phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
        website: place.websiteUri || '',
        rating: place.rating || null,
        ratingCount: place.userRatingCount || 0
      };
    });

    // Check which ones already exist in CRM (by name match)
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('name');

    const existingNames = new Set((existingCompanies || []).map(c => c.name.toLowerCase().trim()));

    const results = places.map(p => ({
      ...p,
      alreadyInCRM: existingNames.has(p.name.toLowerCase().trim())
    }));

    res.json(results);
  } catch (err) {
    console.error('Error in discover:', err);
    res.status(500).json({ error: err.message || 'Failed to search for companies' });
  }
});

// ============================================
// EMAIL ROUTE (Resend API)
// ============================================

app.post('/email/send', authenticateToken, async (req, res) => {
  try {
    const { to, subject, body, company_id } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'To, subject, and body are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY to environment variables.' });
    }

    const fromEmail = 'Delaware Fence Solutions <info@dfs-send.com>';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        reply_to: ['info@delawarefencesolutions.com'],
        subject,
        html: body
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', result);
      throw new Error(result.message || `Email service returned ${response.status}`);
    }

    // Log email as activity if company_id provided
    if (company_id) {
      // Find employee matching user
      const { data: employees } = await supabase
        .from('employees')
        .select('id, name')
        .eq('name', req.user.name)
        .eq('active', true)
        .limit(1);

      const employeeId = employees?.[0]?.id || null;

      if (employeeId) {
        await supabase.from('activities').insert([{
          id: `activity_${Date.now()}`,
          company_id,
          employee_id: employeeId,
          type: 'email',
          answered: 0,
          interested: 0,
          follow_up: 0,
          notes: `Email sent: "${subject}" to ${to}`,
          date: new Date().toISOString().split('T')[0]
        }]);
      }

      // Also add a note to the company
      const { data: company } = await supabase
        .from('companies')
        .select('notes')
        .eq('id', company_id)
        .single();

      if (company) {
        let notesArr = [];
        const raw = company.notes || '';
        if (raw.trim().startsWith('[')) {
          try { notesArr = JSON.parse(raw); } catch (e) { notesArr = []; }
        } else if (raw.trim()) {
          notesArr = [{ id: 'legacy_1', author: 'System', text: raw, timestamp: new Date().toISOString() }];
        }
        notesArr.unshift({
          id: `note_${Date.now()}`,
          author: req.user.name || req.user.username,
          text: `Sent email: "${subject}" to ${to}`,
          timestamp: new Date().toISOString()
        });
        await supabase
          .from('companies')
          .update({ notes: JSON.stringify(notesArr), updated_at: new Date().toISOString() })
          .eq('id', company_id);
      }
    }

    res.json({ message: 'Email sent successfully', id: result.id });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

// Default email templates (seeded on first use)
const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'intro',
    name: 'Introduction Email',
    subject: 'Introduction - Delaware Fence Solutions',
    body: `<p>Hello {{contact_name}},</p>

<p>My name is {{sender_name}}, and I'm reaching out from <strong>Delaware Fence Solutions</strong>, a locally, family-owned Wholesale/Retail Fence Supplier based in Wilmington, Delaware. We specialize exclusively in supplying high-quality fencing materials to contractors, builders, and property managers.</p>

<p>I wanted to introduce ourselves and share how we can support your projects with reliable materials and competitive pricing.</p>

<p><strong>Materials We Stock</strong></p>
<ul>
  <li><strong>Vinyl Fencing</strong> - Low maintenance, multiple styles, 20+ year manufacturer warranties</li>
  <li><strong>Wood Fencing</strong> - Cedar and pine options, panels and components</li>
  <li><strong>Chain Link</strong> - Commercial-grade galvanized materials</li>
  <li><strong>Aluminum Fencing</strong> - Decorative and pool-code compliant systems</li>
  <li><strong>Gates, posts, hardware, and repair materials</strong></li>
</ul>

<p><strong>Why Contractors Work with Us</strong></p>
<ul>
  <li>Competitive contractor pricing</li>
  <li>Local inventory with fast availability</li>
  <li>No installation services — we do not compete with our customers</li>
  <li>Knowledgeable support to help you order the right materials the first time</li>
</ul>

<p>If you're currently sourcing fencing materials or looking for an additional local supplier, we'd be happy to earn your business.</p>

<p>Feel free to reply directly to this email or call us at <strong>302-610-8901</strong>. We look forward to hearing from you.</p>

<p style="color: #333333; margin-top: 20px;">Best regards,<br/>
{{sender_name}}<br/>
<strong style="color: #222222;">Delaware Fence Solutions</strong><br/>
<span style="color: #333333;">1111 Greenbank Road, Wilmington, DE 19808<br/>
302-610-8901<br/>
Info@dfs-send.com<br/>
www.delawarefencesolutions.com</span></p>`
  },
  {
    id: 'follow_up',
    name: 'Follow-Up Email',
    subject: 'Following Up - Delaware Fence Solutions',
    body: `<p>Hello {{contact_name}},</p>

<p>I wanted to follow up on my previous message. I hope you had a chance to review the information about Delaware Fence Solutions.</p>

<p>As a quick reminder, we're a local wholesale/retail fence supplier in Wilmington, DE. We stock vinyl, wood, chain link, aluminum, and all the hardware and accessories you need — at competitive contractor pricing.</p>

<p>If you have any upcoming projects or need a quote on materials, we'd love to help. No pressure at all — just want to make sure you know we're here as a resource.</p>

<p>Feel free to reach out anytime at <strong>302-610-8901</strong> or reply to this email.</p>

<p style="color: #333333; margin-top: 20px;">Best regards,<br/>
{{sender_name}}<br/>
<strong style="color: #222222;">Delaware Fence Solutions</strong><br/>
<span style="color: #333333;">1111 Greenbank Road, Wilmington, DE 19808<br/>
302-610-8901<br/>
Info@dfs-send.com<br/>
www.delawarefencesolutions.com</span></p>`
  },
  {
    id: 'pricing',
    name: 'Pricing Request',
    subject: 'Pricing Information - Delaware Fence Solutions',
    body: `<p>Hello {{contact_name}},</p>

<p>Thank you for your interest in Delaware Fence Solutions! I'm happy to provide pricing on the materials you need.</p>

<p>To get you an accurate quote, could you let me know:</p>
<ul>
  <li>What type of fencing material are you looking for? (vinyl, wood, chain link, aluminum)</li>
  <li>Approximate quantity or linear footage needed?</li>
  <li>Any specific style or height requirements?</li>
  <li>When do you need the materials?</li>
</ul>

<p>Once I have these details, I'll put together a competitive quote for you right away.</p>

<p style="color: #333333; margin-top: 20px;">Best regards,<br/>
{{sender_name}}<br/>
<strong style="color: #222222;">Delaware Fence Solutions</strong><br/>
<span style="color: #333333;">1111 Greenbank Road, Wilmington, DE 19808<br/>
302-610-8901<br/>
Info@dfs-send.com<br/>
www.delawarefencesolutions.com</span></p>`
  }
];

// Get email templates (reads from DB, seeds defaults if empty)
app.get('/email/templates', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // If no templates in DB, seed defaults
    if (!data || data.length === 0) {
      const now = new Date().toISOString();
      const seeded = DEFAULT_EMAIL_TEMPLATES.map(t => ({
        ...t,
        created_at: now,
        updated_at: now
      }));
      const { error: insertErr } = await supabase.from('email_templates').insert(seeded);
      if (insertErr) throw insertErr;
      return res.json(seeded);
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching templates:', err);
    // Fallback to hardcoded defaults if DB fails
    res.json(DEFAULT_EMAIL_TEMPLATES);
  }
});

// Create email template
app.post('/email/templates', authenticateToken, async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'Name, subject, and body are required' });
    }

    const template = {
      id: `template_${Date.now()}`,
      name,
      subject,
      body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('email_templates').insert([template]);
    if (error) throw error;

    res.json(template);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

// Update email template
app.put('/email/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'Name, subject, and body are required' });
    }

    const { error } = await supabase
      .from('email_templates')
      .update({ name, subject, body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Template updated' });
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: err.message || 'Failed to update template' });
  }
});

// Delete email template
app.delete('/email/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: err.message || 'Failed to delete template' });
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
