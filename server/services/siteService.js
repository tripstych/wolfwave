import { query } from '../db/connection.js';
import { getCurrentDbName } from '../lib/tenantContext.js';

export async function getSiteSettings() {
  try {
    const dbName = getCurrentDbName();
    console.log(`[SiteService] Querying settings for tenant DB: ${dbName}`);
    
    const settings = await query('SELECT setting_key, setting_value FROM settings');
    const obj = {};
    settings.forEach(s => {
      obj[s.setting_key] = s.setting_value;
    });
    return obj;
  } catch (err) {
    return {
      site_name: 'WebWolf CMS',
      site_url: 'http://localhost:3000'
    };
  }
}
