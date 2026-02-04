# Quick Reference: SQLite vs Supabase Setup

## Choose Your Path

### 🏃 Quick Start (SQLite - No Setup)
```bash
npm install
npm run init-db
npm start
# Visit http://localhost:3000
# Login: admin / admin123
```
✅ Works immediately  
✅ No external dependencies  
✅ Perfect for development  
❌ Single-user only  
❌ Can't deploy serverless

---

### 🚀 Production Setup (Supabase - 15 min setup)
```bash
# 1. Create Supabase project (https://supabase.io)
# 2. Copy URL and key to .env file
echo "SUPABASE_URL=https://xxxxx.supabase.co" > .env
echo "SUPABASE_ANON_KEY=eyJhbGc..." >> .env
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

# 3. Setup database
npm install
npm run init-db

# 4. Start server
npm start
# Visit http://localhost:3000
# Login: admin / admin123
```
✅ Scalable to 1000s of users  
✅ Cloud hosted  
✅ Easy Vercel deployment  
✅ Automatic backups  
❌ Requires Supabase account  
❌ Adds 50-200ms network latency

---

## Decision Matrix

| Need | Use SQLite | Use Supabase |
|------|-----------|-------------|
| Local development | ✅ | ✅ |
| Single user testing | ✅ | ❌ |
| Multiple team members | ❌ | ✅ |
| Vercel deployment | ❌ | ✅ |
| Quick demo | ✅ | ❌ |
| Production use | ❌ | ✅ |
| Offline capability | ✅ | ❌ |
| Real-time sync | ❌ | ✅ |

---

## Switching Later

**SQLite → Supabase anytime:**
1. Follow Supabase setup steps above
2. Database initializes fresh with 31 sample companies
3. Nothing breaks, just "swap" the backend
4. Old `crm.db` file can be deleted or kept for reference

**Supabase → SQLite (if needed):**
1. `npm uninstall @supabase/supabase-js`
2. `npm install better-sqlite3@11.0.0`
3. Continue using `server.js`
4. Old SQLite database resumes working

---

## File Locations

```
crm-app/
├── server.js                      # SQLite backend (default)
├── server-supabase.js             # Supabase backend (new)
├── database.js                    # Initializes either backend
├── public/index.html              # React frontend (works with both)
├── .env.example                   # Template for .env
├── .env                           # Your local config (create from example)
├── crm.db                         # SQLite database (only if using SQLite)
│
├── SUPABASE-SETUP.md              # ⭐ Read this for Supabase setup
├── MIGRATION-GUIDE.md             # Details on both backends
├── SUPABASE-INTEGRATION-STATUS.md # What was implemented
└── README.md                      # Main documentation
```

---

## Server Startup Commands

### Using SQLite Backend (Current)
```bash
npm start
# Logs: "✓ Server running on port 3000"
# Uses: server.js + crm.db file
```

### Using Supabase Backend (After setup)
```bash
# After: npm run init-db
npm start
# Logs: "✓ Server running on port 3000"
# Uses: server-supabase.js + cloud database
```

Both use `npm start` - the server file determines which backend is used.

---

## Troubleshooting

**"Cannot find module 'better-sqlite3'"**
→ Using Supabase backend, need to run: `npm install`

**"SUPABASE_URL environment variable is required"**
→ Not using Supabase backend, OR .env file missing/incomplete
→ Check: `.env` file exists with SUPABASE_URL and SUPABASE_ANON_KEY

**"crm.db does not exist"**
→ SQLite backend not initialized
→ Run: `npm run init-db`

**"Port 3000 already in use"**
→ Kill existing Node process:
```powershell
# Windows
taskkill /PID (Get-Process -Name node | Select-Object -ExpandProperty Id) /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

---

## Next Steps

**Option A: Stay with SQLite** (Development only)
1. Run `npm install`
2. Run `npm run init-db`
3. Run `npm start`
4. Done! Login with admin/admin123

**Option B: Use Supabase** (Recommended for production)
1. Read: [SUPABASE-SETUP.md](SUPABASE-SETUP.md)
2. Create Supabase account
3. Create project and copy credentials
4. Create `.env` file with credentials
5. Run: `npm install && npm run init-db && npm start`
6. Login with admin/admin123

---

**Questions?** See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for detailed help.

**Status:** ✅ Both backends fully functional and ready to use!
