# Supabase Integration Setup Guide

## Overview
This application has been migrated from SQLite to Supabase PostgreSQL for serverless deployment support (Vercel, etc.).

## Prerequisites
- Node.js v20+ installed
- npm installed
- Supabase account (free tier available at https://supabase.io)

## Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.io)
2. Click "New Project" and fill in:
   - **Project name:** e.g., "DFS CRM"
   - **Database password:** Create a secure password
   - **Region:** Choose closest to your location
   - **Pricing plan:** Free tier is fine for development
3. Click "Create new project" (wait 1-2 minutes for database to be ready)

## Step 2: Get Supabase Credentials

1. In your Supabase project dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **Anon public key** (starts with `eyJhbGc...`)

## Step 3: Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your-random-secret-key-here
   ```

3. **For production**, generate a random JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Initialize Database

Run the database initialization script:
```bash
npm run init-db
```

This will:
- Create tables in Supabase (users, companies, employees, activities)
- Seed 31 companies with sample data
- Create default admin user (username: `admin`, password: `admin123`)

**Output should show:** ✓ Tables initialized and seeded successfully

## Step 6: Start the Server

```bash
npm start
```

Or with auto-reload during development:
```bash
npm run dev
```

Server will run on `http://localhost:3000`

## Step 7: Login

1. Open http://localhost:3000 in your browser
2. Login with:
   - **Username:** `admin`
   - **Password:** `admin123`

## Testing Your Setup

### Option A: Use Frontend
- Login and test all features:
  - Create/edit/delete companies
  - Create/edit/delete employees
  - View company details and notes
  - Log calls/emails in the Calling tab
  - View dashboard statistics

### Option B: Test with curl
```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Copy the token from response, then test an endpoint:
curl -X GET http://localhost:3000/api/companies \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Deployment to Vercel

### Create vercel.json
```json
{
  "buildCommand": "npm install",
  "outputDirectory": "public",
  "env": {
    "SUPABASE_URL": "@supabase_url",
    "SUPABASE_ANON_KEY": "@supabase_anon_key",
    "JWT_SECRET": "@jwt_secret"
  }
}
```

### Deploy Steps
1. Push to GitHub
2. Connect GitHub repo to Vercel
3. Add environment variables in Vercel dashboard:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - JWT_SECRET
4. Deploy!

The frontend will auto-update its API base URL when deployed.

## Key File Changes

### server.js (NEW: server-supabase.js)
- Replaced: `better-sqlite3` with `@supabase/supabase-js`
- Changed: All synchronous `.prepare().run()` queries to async `.from().insert/select/update/delete()`
- Updated: All route handlers to use async/await
- Maintained: All original endpoints and functionality

### database.js (UPDATED)
- Now creates Supabase tables instead of SQLite
- Uses async initialization pattern
- Creates PostgreSQL tables with proper schema
- Handles migrations for column additions

### package.json (UPDATED)
- Removed: `better-sqlite3`
- Added: `@supabase/supabase-js`

### .env (NEW)
- Replaces `DB_PATH=crm.db` with Supabase credentials
- Added `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Troubleshooting

### "SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required"
- Check `.env` file exists in root directory
- Verify values are copied correctly from Supabase dashboard
- Restart server after updating `.env`

### "User already exists" error
- Default seed data includes 31 companies
- If rerunning init-db, existing data will cause duplication errors (expected)
- To reset: Delete all rows from tables in Supabase dashboard, then run `npm run init-db` again

### Tables not created
- Check Supabase project is active in dashboard
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Run `npm run init-db` again
- Check browser console for specific error messages

### Authentication errors
- Verify JWT_SECRET is set in `.env`
- Default credentials are: `admin` / `admin123`
- JWT tokens expire after 24 hours (frontend will show login screen)

### API returns 500 errors
- Check server logs for specific error message
- Verify Supabase tables exist in dashboard
- Ensure SUPABASE_ANON_KEY has proper permissions (should have read/write on all tables)

## Security Notes

1. **Change the default admin password immediately:**
   - Login as admin
   - Update password in user settings (or delete user and create new account)

2. **Generate random JWT_SECRET for production:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Never commit `.env` file to Git:**
   - Already in `.gitignore`
   - Each environment (dev, staging, production) needs its own `.env`

4. **Supabase security:**
   - Row Level Security (RLS) can be enabled in Supabase dashboard for fine-grained access control
   - Currently using Anon key for public access (suitable for internal apps)
   - Consider adding RLS policies for production

## Database Schema

### users
- id (UUID, primary key)
- username (text, unique)
- password (text, hashed with bcryptjs)
- name (text)
- role (text: 'admin', 'user')
- created_at (timestamp)

### companies
- id (text, primary key)
- name (text)
- type (text)
- contact_name (text, nullable)
- address, city, state, zip (text)
- phone, email, website (text)
- notes (text)
- is_customer (integer: 0/1)
- last_order_date, last_estimate_date (date, nullable)
- created_at, updated_at (timestamp)

### employees
- id (text, primary key)
- name (text)
- role (text)
- active (integer: 0/1)
- created_at, updated_at (timestamp)

### activities
- id (UUID, primary key)
- company_id (text, foreign key to companies)
- employee_id (text, foreign key to employees)
- type (text: 'call', 'email', etc.)
- answered, interested, follow_up (integer: 0/1)
- notes (text)
- date (timestamp)
- created_at (timestamp)

## API Endpoints

All endpoints require authentication via JWT token in `Authorization: Bearer TOKEN` header.

### Authentication
- `POST /auth/login` - Login with credentials
- `POST /auth/register` - Create new user account

### Companies
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

### Employees
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Activities
- `GET /api/activities` - List all activities
- `POST /api/activities` - Create activity
- `DELETE /api/activities/:id` - Delete activity

### Stats
- `GET /api/stats` - Get dashboard statistics

## Support

For issues with:
- **Supabase:** Visit [Supabase Docs](https://supabase.io/docs)
- **Server errors:** Check console logs and `.env` configuration
- **Frontend:** Open browser DevTools console for error details

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Configure `.env` file
3. ✅ Run `npm run init-db`
4. ✅ Start server with `npm start`
5. ✅ Test all features in browser
6. 📋 Create Vercel account and deploy
7. 📋 Update DNS if using custom domain
8. 📋 Enable Row Level Security (RLS) in Supabase for production
