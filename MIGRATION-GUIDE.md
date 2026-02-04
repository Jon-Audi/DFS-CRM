# Migration Guide: SQLite → Supabase

## Summary of Changes

Your CRM application has been converted from SQLite (local file-based) to Supabase PostgreSQL for serverless deployment support.

## Files Changed

### ✅ server-supabase.js (NEW)
**Location:** `server-supabase.js`
**What changed:** Complete rewrite from SQLite to Supabase
- Replaced `better-sqlite3` with `@supabase/supabase-js` client
- All endpoints converted from sync to async/await
- All database queries converted to Supabase SDK methods

**Example conversion:**
```javascript
// OLD (SQLite):
const stmt = db.prepare('SELECT * FROM companies WHERE id = ?');
const company = stmt.get(id);

// NEW (Supabase):
const { data: company, error } = await supabase
  .from('companies')
  .select('*')
  .eq('id', id)
  .single();
```

**All 14 endpoints preserved:**
- ✅ POST /auth/login
- ✅ POST /auth/register
- ✅ GET /api/companies
- ✅ POST /api/companies
- ✅ PUT /api/companies/:id
- ✅ DELETE /api/companies/:id
- ✅ GET /api/employees
- ✅ POST /api/employees
- ✅ PUT /api/employees/:id
- ✅ DELETE /api/employees/:id
- ✅ GET /api/activities
- ✅ POST /api/activities
- ✅ DELETE /api/activities/:id
- ✅ GET /api/stats

### ✅ database.js (UPDATED)
**What changed:** Now initializes Supabase tables instead of SQLite
- Creates PostgreSQL tables with proper data types
- Inserts 31 companies + admin user
- Uses async initialization pattern
- No local file storage needed

### ✅ package.json (UPDATED)
**Changes:**
- ❌ Removed: `better-sqlite3` v11.0.0
- ✅ Added: `@supabase/supabase-js` v2.38.0
- All other dependencies unchanged

### ✅ .env.example (UPDATED)
**Old:**
```env
DB_PATH=crm.db
```

**New:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

### ⭐ SUPABASE-SETUP.md (NEW)
Complete step-by-step setup guide for Supabase integration

### ✅ public/index.html
**No changes needed!** Frontend is fully compatible with both SQLite and Supabase backends.

## How to Use

### Step 1: Replace server.js
```bash
# Backup old SQLite server (optional)
mv server.js server-sqlite.js

# Use new Supabase server
mv server-supabase.js server.js
```

### Step 2: Set up Supabase
Follow [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for detailed instructions

Quick version:
1. Create Supabase project at https://supabase.io
2. Copy project URL and Anon key
3. Create `.env` file with credentials
4. Run `npm run init-db` to create tables and seed data
5. Run `npm start` to start server

### Step 3: Test
- Frontend works exactly the same
- All existing features work identically
- Database is now cloud-hosted instead of local

## Key Differences

| Feature | SQLite | Supabase |
|---------|--------|----------|
| **Storage** | Local file (`crm.db`) | Cloud database |
| **Queries** | Synchronous | Asynchronous (async/await) |
| **Scalability** | Single computer | Scales to millions |
| **Deployment** | Requires Node server | Works with serverless (Vercel) |
| **Real-time** | Not built-in | Built-in support |
| **Backups** | Manual | Automatic daily |
| **Multi-user** | Limited | Full concurrent support |

## Code Architecture

### New Request Flow

```
Client Request
    ↓
Express Route Handler (async)
    ↓
Supabase SDK Method
    ↓
Supabase PostgreSQL Database (in the cloud)
    ↓
Response with data/error
    ↓
Client receives JSON response
```

### Error Handling Pattern

```javascript
try {
  const { data, error } = await supabase
    .from('table')
    .operation();  // select, insert, update, delete
  
  if (error) throw error;
  res.json(data);
} catch (err) {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
}
```

## Database Schema (PostgreSQL)

All tables were created with proper types for Supabase:

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### companies
```sql
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  contact_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  is_customer INTEGER DEFAULT 0,
  last_order_date DATE,
  last_estimate_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### employees
```sql
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### activities
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  employee_id TEXT REFERENCES employees(id),
  type TEXT,
  answered INTEGER DEFAULT 0,
  interested INTEGER DEFAULT 0,
  follow_up INTEGER DEFAULT 0,
  notes TEXT,
  date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Migration Checklist

- [ ] Read SUPABASE-SETUP.md
- [ ] Create Supabase account (free)
- [ ] Create Supabase project
- [ ] Copy credentials to .env
- [ ] Replace server.js with server-supabase.js
- [ ] Run `npm install` (if not done)
- [ ] Run `npm run init-db`
- [ ] Run `npm start`
- [ ] Login and test all features
- [ ] Verify dark mode, companies, employees, calling, activities all work
- [ ] (Optional) Push to Git
- [ ] (Optional) Deploy to Vercel

## Troubleshooting

### "SUPABASE_URL is required"
- Check `.env` file exists and has correct values
- Run from project root directory
- Restart server after updating `.env`

### "Cannot find module '@supabase/supabase-js'"
- Run `npm install` again
- Check package.json has `@supabase/supabase-js` entry
- Delete node_modules and run `npm install` fresh

### Old database still showing
- Supabase is cloud database, not `crm.db`
- Supabase tables are separate from local SQLite
- You can delete `crm.db` once fully migrated

### Vercel deployment: "Cannot find environment variables"
- Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel dashboard
- Go to Project Settings > Environment Variables
- Add each variable for production environment

## Rollback (Back to SQLite)

If you need to go back to SQLite:

```bash
# Restore old server
mv server.js server-supabase.js
mv server-sqlite.js server.js

# Remove Supabase from package.json
npm uninstall @supabase/supabase-js

# Install SQLite again
npm install better-sqlite3@11.0.0

# Run with old database
npm start
```

## Performance Notes

**Supabase vs SQLite:**
- **Latency:** SQLite faster (local), Supabase adds ~50-200ms network delay
- **Scalability:** Supabase handles 1000s of concurrent users, SQLite limited to 1
- **Suitable for:**
  - SQLite: Development, single-user apps, offline-first
  - Supabase: Production, multi-user, serverless, cloud-native

## Next Steps

1. Complete Supabase setup (see SUPABASE-SETUP.md)
2. Deploy to Vercel for production hosting
3. Enable Row Level Security (RLS) in Supabase for fine-grained access control
4. Set up automated backups and monitoring

## Questions?

Refer to:
- [SUPABASE-SETUP.md](SUPABASE-SETUP.md) - Complete setup instructions
- [Supabase Documentation](https://supabase.io/docs)
- [Express.js Documentation](https://expressjs.com)
- [Supabase JavaScript Client Docs](https://supabase.io/docs/reference/javascript/introduction)

Your application is now ready for production deployment! 🚀
