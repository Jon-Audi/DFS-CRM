const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('crm.db');

console.log('Creating database tables...\n');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    last_order_date DATETIME,
    last_estimate_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_activities_company ON activities(company_id);
  CREATE INDEX IF NOT EXISTS idx_activities_employee ON activities(company_id);
  CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
`);

console.log('✓ Tables created');

// Migration: Add contact_name column if it doesn't exist
try {
  const checkColumn = db.prepare("PRAGMA table_info(companies)").all();
  const hasContactName = checkColumn.some(col => col.name === 'contact_name');
  if (!hasContactName) {
    console.log('Running migration: Adding contact_name column...');
    db.exec('ALTER TABLE companies ADD COLUMN contact_name TEXT');
    console.log('✓ contact_name column added');
  }
} catch (err) {
  console.log('Note: contact_name column already exists');
}

// Insert initial employee data
console.log('\nInserting initial employee...');
const insertEmployee = db.prepare('INSERT OR IGNORE INTO employees (id, name, role, active) VALUES (?, ?, ?, ?)');
insertEmployee.run('emp_1', 'Jon', 'Sales Manager', 1);
console.log('✓ Added Jon as Sales Manager');

// Insert company data
console.log('\nInserting company data...');
const companies = [
  {"id": "company_1", "name": "Ramones Landscaping", "type": "Landscape", "address": "4905 Mermaid Blvd", "city": "Wilmington", "state": "DE", "zip": "19808", "phone": "(302) 268-8023", "email": "", "website": "ramoneslandscaping.com", "notes": "Hardscaping, snow removal"},
  {"id": "company_2", "name": "Marshall Landscaping LLC", "type": "Landscape", "address": "1902 Newport Gap Pike", "city": "Wilmington", "state": "DE", "zip": "19808", "phone": "(302) 454-7838", "email": "office@marshalllandscapingllc.com", "website": "marshalllandscapingllc.com", "notes": "Hardscaping, asphalt, concrete"},
  {"id": "company_3", "name": "Ruppert Landscape", "type": "Landscape", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "(302) 318-1035", "email": "", "website": "ruppertlandscape.com", "notes": "Commercial services"},
  {"id": "company_4", "name": "BrightView Landscape", "type": "Landscape", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "brightview.com", "notes": "Commercial landscape services"},
  {"id": "company_5", "name": "Green Acres Lawn & Landscaping", "type": "Landscape", "address": "978 S Market St", "city": "Wilmington", "state": "DE", "zip": "19801", "phone": "(302) 332-8239", "email": "", "website": "greenacresde.com", "notes": ""},
  {"id": "company_6", "name": "Ace Property Solutions", "type": "Landscape", "address": "1220 Arundel Dr", "city": "Wilmington", "state": "DE", "zip": "19808", "phone": "(302) 544-6675", "email": "acepropertysolutions1@gmail.com", "website": "acepropertysolutionsinc.com", "notes": "Certified lawn care"},
  {"id": "company_7", "name": "Irwin Landscaping", "type": "Landscape", "address": "", "city": "Hockessin", "state": "DE", "zip": "", "phone": "(302) 239-9229", "email": "irwinland@msn.com", "website": "", "notes": "Design/build/install"},
  {"id": "company_8", "name": "Pickel Landscape Group", "type": "Landscape", "address": "", "city": "Landenberg", "state": "PA", "zip": "", "phone": "", "email": "", "website": "", "notes": "Hardscaping, custom fire pits"},
  {"id": "company_9", "name": "Nature's Beauty Landscaping LLC", "type": "Landscape", "address": "", "city": "Avondale", "state": "PA", "zip": "19311", "phone": "", "email": "", "website": "", "notes": ""},
  {"id": "company_10", "name": "Anchor Fence", "type": "Fencing", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "anchorfencede.com", "notes": ""},
  {"id": "company_11", "name": "C&N Fencing", "type": "Fencing", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "", "notes": ""},
  {"id": "company_12", "name": "FBF Fence & Railing", "type": "Fencing", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "", "notes": ""},
  {"id": "company_13", "name": "Affordable Fence", "type": "Fencing", "address": "303 Blue Rock Rd", "city": "Wilmington", "state": "DE", "zip": "19809", "phone": "(302) 762-6630", "email": "", "website": "", "notes": ""},
  {"id": "company_14", "name": "Pioneer Fence Co. Inc.", "type": "Fencing", "address": "109 S John St", "city": "Wilmington", "state": "DE", "zip": "19804", "phone": "(302) 998-2892", "email": "info@pioneerfencedelaware.com", "website": "", "notes": "Est. 1939"},
  {"id": "company_15", "name": "Superior Fence & Rail", "type": "Fencing", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "(302) 985-5151", "email": "", "website": "superiorfenceandrail.com", "notes": ""},
  {"id": "company_16", "name": "A.C. Fence Company", "type": "Fencing", "address": "", "city": "Newark", "state": "DE", "zip": "", "phone": "(302) 359-1660", "email": "", "website": "acfencecompanyde.com", "notes": "20+ years"},
  {"id": "company_17", "name": "J&A Fence", "type": "Fencing", "address": "", "city": "Hockessin", "state": "DE", "zip": "", "phone": "", "email": "", "website": "jafence.com", "notes": "Serves Avondale/Landenberg"},
  {"id": "company_18", "name": "The Fence Authority", "type": "Fencing", "address": "", "city": "Landenberg", "state": "PA", "zip": "", "phone": "(800) 431-4303", "email": "", "website": "fenceauthority.com", "notes": "Lifetime warranty"},
  {"id": "company_19", "name": "Lundy's Fence Co.", "type": "Fencing", "address": "", "city": "Hockessin", "state": "DE", "zip": "", "phone": "", "email": "", "website": "lundysfence.com", "notes": "Serves Landenberg/Avondale"},
  {"id": "company_20", "name": "Affordable Fencing Solutions", "type": "Fencing", "address": "", "city": "Landenberg", "state": "PA", "zip": "", "phone": "", "email": "", "website": "affordablefencingsolutionsllc.com", "notes": ""},
  {"id": "company_21", "name": "Sunnyburn Fencing", "type": "Fencing", "address": "", "city": "Landenberg", "state": "PA", "zip": "", "phone": "(717) 862-3093", "email": "", "website": "sunnyburnfencing.com", "notes": "Since 2002"},
  {"id": "company_22", "name": "Rustic Rail Fence Company", "type": "Fencing", "address": "", "city": "Street", "state": "MD", "zip": "", "phone": "", "email": "", "website": "rusticrailfence.com", "notes": "Serves Elkton/North East"},
  {"id": "company_23", "name": "Fence & Deck Connection", "type": "Fencing", "address": "", "city": "Maryland", "state": "MD", "zip": "", "phone": "(800) 222-9268", "email": "", "website": "fenceanddeckconnection.com", "notes": ""},
  {"id": "company_24", "name": "Long Fence", "type": "Fencing", "address": "", "city": "Maryland", "state": "MD", "zip": "", "phone": "", "email": "", "website": "longfence.com", "notes": "Est. 1945"},
  {"id": "company_25", "name": "Colonial Construction", "type": "Construction", "address": "126 Middleboro Rd", "city": "Wilmington", "state": "DE", "zip": "19804", "phone": "(302) 994-5705", "email": "", "website": "colonialconstructionde.com", "notes": "Since 1957, Fragomele family"}
];

// Add remaining companies (truncated for brevity - continuing with actual data)
const allCompanies = [...companies,
  {"id": "company_26", "name": "Bancroft Construction", "type": "Construction", "address": "1300 N. Grant Avenue, Suite 101", "city": "Wilmington", "state": "DE", "zip": "19806", "phone": "(302) 655-3434", "email": "", "website": "bancroftconstruction.com", "notes": ""},
  {"id": "company_27", "name": "Dewson Construction Company", "type": "Construction", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "", "notes": ""},
  {"id": "company_28", "name": "EDiS Company", "type": "Construction", "address": "110 South Poplar Street, Suite 400", "city": "Wilmington", "state": "DE", "zip": "19801", "phone": "(302) 421-5700", "email": "info@ediscompany.com", "website": "ediscompany.com", "notes": "Regional DE/MD/PA/NJ"},
  {"id": "company_29", "name": "Northern Construction", "type": "Construction", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "", "email": "", "website": "northernconstruction.com", "notes": ""},
  {"id": "company_30", "name": "BPGS Construction", "type": "Construction", "address": "1000 N. West Street, Suite 850", "city": "Wilmington", "state": "DE", "zip": "19801", "phone": "(302) 691-2111", "email": "info@bpgsconstruction.com", "website": "bpgsconstruction.com", "notes": ""},
  {"id": "company_40", "name": "Don's Handyman Services", "type": "Handyman", "address": "", "city": "Wilmington", "state": "DE", "zip": "", "phone": "(302) 482-5065", "email": "delawarehandyman302@gmail.com", "website": "handyman302.com", "notes": ""}
];

const insertCompany = db.prepare(`
  INSERT OR IGNORE INTO companies (id, name, type, address, city, state, zip, phone, email, website, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((companies) => {
  for (const company of companies) {
    insertCompany.run(
      company.id, company.name, company.type, company.address,
      company.city, company.state, company.zip, company.phone,
      company.email, company.website, company.notes
    );
  }
});

insertMany(allCompanies);
console.log(`✓ Inserted ${allCompanies.length} companies`);

// Create default admin user
console.log('\nCreating default admin user...');
const adminPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(adminPassword, 10);

try {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
  insertUser.run('admin', hashedPassword, 'Administrator', 'admin');
  console.log('✓ Admin user created');
  console.log('  Username: admin');
  console.log('  Password: admin123');
  console.log('\n⚠️  IMPORTANT: Change the admin password after first login!\n');
} catch (err) {
  console.log('  Admin user already exists');
}

db.close();
console.log('\n✓ Database initialization complete!\n');
