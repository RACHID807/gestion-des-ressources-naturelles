const { Pool } = require('pg');

const regions = [
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ca-central-1', 'sa-east-1'
];

const pass = 'Firdawsbe8*';
const ref = 'obrujgpbduzsenllwxgx';

async function testRegions() {
  console.log("Recherche de la région Supabase...");
  for (const region of regions) {
    const url = `postgresql://postgres.${ref}:${pass}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await pool.query('SELECT 1');
      console.log(`\n✅ SUCCES ! L'URL correcte a été trouvée :`);
      console.log(url);
      process.exit(0);
    } catch (e) {
      // Ignore errors, just move to next
    } finally {
      // pool.end() without await to avoid hanging if it timed out
      pool.end().catch(()=>{}).then(()=>{});
    }
  }
  console.log('\n❌ Aucune région standard n\'a fonctionné.');
  process.exit(1);
}

testRegions();
