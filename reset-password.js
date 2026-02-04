require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function resetPassword() {
  const newPassword = '!Audiffred23';
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  
  const { error } = await supabase
    .from('users')
    .update({ password: hashedPassword })
    .eq('username', 'admin');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Password updated successfully!');
    console.log('Username: admin');
    console.log('Password: !Audiffred23');
  }
  
  process.exit(0);
}

resetPassword();
