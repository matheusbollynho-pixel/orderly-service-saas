import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://xqndblstrblqleraepzs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Read the SQL file
const sql = fs.readFileSync('supabase/migrations/202602162000_create_test_satisfaction_rpc.sql', 'utf-8');

// Execute the SQL
const { data, error } = await supabase.rpc('execute_sql', { sql });

if (error) {
  console.error('❌ Error deploying RPC:', error);
  process.exit(1);
} else {
  console.log('✅ RPC function deployed successfully!');
  console.log(data);
}
