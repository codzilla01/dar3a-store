#!/usr/bin/env node
// Creates or resets the initial developer account without putting a password in SQL or Git.
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const [usernameArg, password, ...displayParts] = process.argv.slice(2);
const username = String(usernameArg || '').trim().toLowerCase();
const displayName = displayParts.join(' ').trim() || 'Developer';

if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    console.error('Usage: npm run bootstrap-developer -- <username> <password-at-least-12-chars> [display name]');
    process.exit(1);
}
if (String(password || '').length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error('The password must be at least 12 characters and include letters and numbers.');
    process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in .env.');
    process.exit(1);
}

(async () => {
    const supabase = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_KEY.trim(), {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const password_hash = await bcrypt.hash(password, 12);
    const { error } = await supabase.from('admin_users').upsert({
        username,
        display_name: displayName.slice(0, 100),
        role: 'developer',
        password_hash,
        is_active: true,
        updated_at: new Date().toISOString()
    }, { onConflict: 'username' });
    if (error) throw error;
    console.log(`Developer "${username}" is ready. Keep the password in a password manager.`);
})().catch((error) => {
    console.error(`Could not create the developer: ${error.message}`);
    process.exit(1);
});
