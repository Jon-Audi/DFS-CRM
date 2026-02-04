require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Parse CSV with proper handling of quoted fields and commas
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Parse a single CSV line handling quoted fields
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  
  const headers = parseLine(lines[0]);
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseLine(lines[i]);
    if (values.length === 0 || !values[0]) continue;
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    if (row['Company Name']) {
      data.push(row);
    }
  }
  
  return data;
}

async function importData() {
  try {
    console.log('🗑️  Deleting all existing companies...');
    const { error: deleteError } = await supabase
      .from('companies')
      .delete()
      .neq('id', ''); // Delete all rows
    
    if (deleteError) {
      console.error('Error deleting companies:', deleteError);
    } else {
      console.log('✅ All existing companies deleted');
    }
    
    console.log('\n📁 Reading CSV file...');
    const csvPath = 'C:\\Users\\Jondf\\OneDrive\\Desktop\\contractor_database (1).csv';
    const rows = parseCSV(csvPath);
    
    console.log(`✅ Found ${rows.length} companies in CSV\n`);
    
    console.log('📤 Importing companies to Supabase...');
    let imported = 0;
    
    for (const row of rows) {
      const company = {
        id: `company_${Date.now()}_${imported}`,
        name: row['Company Name'],
        type: row['Type'] || 'General',
        contact_name: null,
        address: row['Address'] || '',
        city: row['City'] || '',
        state: row['State'] || '',
        zip: row['Zip'] || '',
        phone: row['Phone'] || '',
        email: row['Email'] || '',
        website: row['Website'] || '',
        notes: row['Services/Notes'] || '',
        is_customer: 0,
        last_order_date: null,
        last_estimate_date: null
      };
      
      const { error } = await supabase
        .from('companies')
        .insert([company]);
      
      if (error) {
        console.error(`❌ Failed to import: ${company.name}`, error.message);
      } else {
        imported++;
        if (imported % 10 === 0) {
          console.log(`   Imported ${imported}/${rows.length}...`);
        }
      }
    }
    
    console.log(`\n✅ Import complete! ${imported}/${rows.length} companies imported`);
    console.log('\n🔄 Refresh your browser to see the new data!');
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
  
  process.exit(0);
}

importData();
