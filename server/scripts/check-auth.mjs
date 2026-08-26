const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
  body: JSON.stringify({ email: 'amira@petsandpets.local', password: 'Password123!' }),
});

const body = await res.json();
if (!res.ok) {
  console.error('LOGIN FAILED', res.status, body);
  process.exit(1);
}

console.log('Login OK. access_token (first 40 chars):', body.access_token.slice(0, 40) + '...');

// Decode the JWT payload (no verification — just inspecting claims for the smoke test)
const payload = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString('utf8'));
console.log('JWT claims (full):', payload);
