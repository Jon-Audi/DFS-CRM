# 🚀 Quick Setup Instructions for Supabase

## Step 1: Create Tables in Supabase

1. Go to your Supabase project: https://emwgfezkkkdcdmnvnppb.supabase.co
2. Click on **"SQL Editor"** in the left sidebar (it has a terminal icon)
3. Click **"New Query"** button
4. Copy ALL the SQL code from the file `supabase-schema.sql` (shown below)
5. Paste it into the SQL editor
6. Click **"Run"** or press Ctrl+Enter

**SQL to copy and paste:**
```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
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
  last_order_date TIMESTAMP,
  last_estimate_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  type TEXT NOT NULL,
  answered INTEGER DEFAULT 0,
  interested INTEGER DEFAULT 0,
  follow_up INTEGER DEFAULT 0,
  notes TEXT,
  date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
```

**Expected result:** You should see "Success. No rows returned"

---

## Step 1b: Enable Security (RLS, Indexes, Policies)

⚠️ **IMPORTANT:** Make sure you did Step 1 first (created tables)

1. Still in the **SQL Editor**
2. Click **"New Query"** again
3. Copy the entire SQL from [supabase-security.sql](supabase-security.sql) below
4. Paste it into the SQL editor
5. Click **"Run"** - you should see multiple success messages

**SQL to copy and paste:**
```sql
-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_company_id ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_employee_id ON activities(employee_id);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable read for all" ON public.users;
DROP POLICY IF EXISTS "Enable insert for all" ON public.users;
DROP POLICY IF EXISTS "Enable update for all" ON public.users;
DROP POLICY IF EXISTS "Enable delete for all" ON public.users;

DROP POLICY IF EXISTS "Enable read for all" ON public.companies;
DROP POLICY IF EXISTS "Enable insert for all" ON public.companies;
DROP POLICY IF EXISTS "Enable update for all" ON public.companies;
DROP POLICY IF EXISTS "Enable delete for all" ON public.companies;

DROP POLICY IF EXISTS "Enable read for all" ON public.employees;
DROP POLICY IF EXISTS "Enable insert for all" ON public.employees;
DROP POLICY IF EXISTS "Enable update for all" ON public.employees;
DROP POLICY IF EXISTS "Enable delete for all" ON public.employees;

DROP POLICY IF EXISTS "Enable read for all" ON public.activities;
DROP POLICY IF EXISTS "Enable insert for all" ON public.activities;
DROP POLICY IF EXISTS "Enable update for all" ON public.activities;
DROP POLICY IF EXISTS "Enable delete for all" ON public.activities;

-- Create new policies
CREATE POLICY "users_allow_all" ON public.users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (true);
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (true);

CREATE POLICY "employees_select" ON public.employees FOR SELECT USING (true);
CREATE POLICY "employees_insert" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update" ON public.employees FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "employees_delete" ON public.employees FOR DELETE USING (true);

CREATE POLICY "activities_select" ON public.activities FOR SELECT USING (true);
CREATE POLICY "activities_insert" ON public.activities FOR INSERT WITH CHECK (true);
CREATE POLICY "activities_update" ON public.activities FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "activities_delete" ON public.activities FOR DELETE USING (true);
```

**Expected result:** Multiple "Success" messages

**Verify it worked:**
1. Go to your Supabase project dashboard
2. Go to **Authentication > Policies** 
3. You should see policies listed for all 4 tables
4. Security warnings should disappear (refresh the page)

---

## Step 2: Seed the Database

After the SQL runs successfully, come back to PowerShell and run:

```powershell
npm run init-db
```

This will:
- ✅ Add 31 companies
- ✅ Add 1 employee (Jon - Sales Manager)
- ✅ Create admin user (username: admin, password: admin123)

---

## Step 3: Start the Server

```powershell
npm start
```

Then visit http://localhost:3000 and login with:
- **Username:** admin
- **Password:** admin123

---

## Troubleshooting

**"npm run init-db" error?**
- Make sure you ran the SQL in Supabase SQL Editor first (Step 1)
- Check that tables were created: Go to Supabase → Table Editor → You should see 4 tables

**Tables already exist?**
- That's fine! The SQL uses `IF NOT EXISTS` so it won't duplicate
- Just run `npm run init-db` to add data

**Still not working?**
- Check .env file has correct SUPABASE_URL and SUPABASE_ANON_KEY
- Restart PowerShell terminal
- Run: `npm install` again

---

**Current Status:**
- ✅ .env configured with your Supabase credentials
- ✅ Dependencies installed
- ⏳ Waiting for you to run SQL in Supabase (Steps 1 & 1b above)
- ⏳ Then run `npm run init-db` (Step 2)
- ⏳ Then `npm start` (Step 3)
