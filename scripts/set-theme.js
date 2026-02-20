import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma, { closePrisma } from '../server/lib/prisma.js';
import { clearThemeCache } from '../server/services/themeResolver.js';
import { syncTemplatesToDb } from '../server/services/templateParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '../themes');

async function setTheme(themeName) {
  if (!themeName) {
    console.error('Usage: node scripts/set-theme.js <theme-name>');
    process.exit(1);
  }

  // 1. Validate theme exists
  const themePath = path.join(THEMES_DIR, themeName);
  if (!fs.existsSync(themePath)) {
    console.error(`Error: Theme "${themeName}" not found in ${THEMES_DIR}`);
    console.log('Available themes:');
    try {
      const themes = fs.readdirSync(THEMES_DIR).filter(f => fs.statSync(path.join(THEMES_DIR, f)).isDirectory());
      themes.forEach(t => console.log(` - ${t}`));
    } catch (e) {
      console.error('Error listing themes:', e.message);
    }
    process.exit(1);
  }

  console.log(`Setting active theme to: ${themeName}...`);

  try {
    // 2. Update active_theme setting
    await prisma.settings.upsert({
      where: { setting_key: 'active_theme' },
      update: { setting_value: themeName },
      create: { setting_key: 'active_theme', setting_value: themeName }
    });
    
    console.log('✓ Database setting updated.');

    // 3. Clear theme cache
    clearThemeCache();
    console.log('✓ Theme cache cleared.');

    // 4. Sync templates
    console.log('Syncing templates...');
    const result = await syncTemplatesToDb(prisma, themeName);
    console.log(`✓ Synced ${result.length} templates from theme "${themeName}".`);
    
    console.log('\nSuccess! Theme updated.');
  } catch (error) {
    console.error('Failed to set theme:', error);
    process.exit(1);
  } finally {
    await closePrisma();
  }
}

const themeName = process.argv[2];
setTheme(themeName);