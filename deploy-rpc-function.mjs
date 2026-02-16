#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, 'supabase/migrations/202602162000_create_test_satisfaction_rpc.sql');

// Get your Supabase project URL and service key
const SUPABASE_URL = 'https://xqndblstrblqleraepzs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.error('   Set it with: set SUPABASE_SERVICE_ROLE_KEY=your_key');
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.error(`❌ Error: SQL file not found at ${sqlFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf-8');

console.log('📝 Deploying RPC function to Supabase...');
console.log(`📁 File: ${sqlFile}`);
console.log(`🌐 URL: ${SUPABASE_URL}`);

// Use the REST API to execute SQL via a function
// We'll make a request to the edge function or directly via postgres
const url = new URL('/rest/v1/rpc/execute_sql', SUPABASE_URL);

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey': SUPABASE_SERVICE_KEY,
  },
};

// Alternative: Use psql if available
const { exec } = await import('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function deployViaSQL() {
  try {
    // Try using psql first (if available)
    console.log('\n🔍 Checking for psql...');
    
    const db_url = `postgresql://postgres@db.xqndblstrblqleraepzs.supabase.co/postgres`;
    
    // For Windows, we need to set the password via environment
    process.env.PGPASSWORD = process.env.SUPABASE_DB_PASSWORD;
    
    if (!process.env.SUPABASE_DB_PASSWORD) {
      console.warn('⚠️  SUPABASE_DB_PASSWORD not set. Skipping psql attempt.');
      console.log('\nℹ️  You can deploy the RPC function manually:');
      console.log('   1. Go to: https://app.supabase.com/project/xqndblstrblqleraepzs');
      console.log('   2. Click: SQL Editor');
      console.log('   3. Create new query');
      console.log('   4. Copy & paste the content from:');
      console.log(`      ${sqlFile}`);
      console.log('   5. Click: Run');
      return;
    }

    try {
      const { stdout, stderr } = await execPromise(`psql ${db_url} -f "${sqlFile}"`, {
        maxBuffer: 1024 * 1024 * 10,
        timeout: 30000
      });

      if (stderr) console.log('📋 Output:', stderr);
      console.log('✅ RPC function deployed successfully!');
      console.log(stdout);
      return;
    } catch (psqlError) {
      console.log('ℹ️  psql not available or failed, showing manual instructions...');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Fallback: Show manual instructions
  console.log('\n' + '='.repeat(70));
  console.log('📌 DEPLOY MANUALLY IN SUPABASE DASHBOARD:');
  console.log('='.repeat(70));
  console.log('\n1. Open: https://app.supabase.com/project/xqndblstrblqleraepzs');
  console.log('2. Click on: "SQL Editor" in the left sidebar');
  console.log('3. Click: "New Query" button');
  console.log('4. Copy the SQL below and paste into the editor:');
  console.log('\n' + '-'.repeat(70));
  console.log(sql);
  console.log('-'.repeat(70));
  console.log('\n5. Click the "Run" button (bottom right)');
  console.log('6. Wait for success message');
  console.log('\n✨ After deployment, the "Teste 4 Segundos" button will work!');
  console.log('='.repeat(70));
}

deployViaSQL();
