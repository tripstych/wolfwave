import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { query } from '../db/connection.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

/**
 * Get the tenant-specific uploads directory.
 */
function getTenantUploadsDir() {
  const dbName = getCurrentDbName();
  const subdomain = dbName.replace(/^wolfwave_/, '') || '_default';
  return path.join(UPLOADS_ROOT, subdomain);
}

/**
 * Download an image from a URL and save it to the local media library.
 * Returns the local URL of the saved image.
 */
export async function downloadImage(url, altText = '', userId = null) {
  const dbName = getCurrentDbName();
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return url;

    // Normalize URL
    const imageUrl = new URL(url).toString();

    // 1. Check if we already have this original URL to avoid duplicates
    // Using LIKE to handle potential truncation in DB
    const existing = await query('SELECT path FROM media WHERE original_name = ? OR original_name LIKE ? LIMIT 1', [imageUrl, imageUrl.substring(0, 250) + '%']);
    if (existing && existing.length > 0) {
      return `/uploads${existing[0].path}`;
    }
    
    // 2. Fetch the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'WebWolf-Media-Bot/1.0' }
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
        throw new Error(`URL is not an image: ${contentType}`);
      }
    }

    // 3. Prepare storage path
    const tenantDir = getTenantUploadsDir();
    const date = new Date();
    const subdir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const fullPath = path.join(tenantDir, subdir);
    await fs.mkdir(fullPath, { recursive: true });

    // 4. Generate filename
    const urlObj = new URL(imageUrl);
    const originalFilename = path.basename(urlObj.pathname) || 'imported-image';
    const ext = path.extname(originalFilename) || ('.' + (contentType ? contentType.split('/')[1] : 'jpg'));
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(fullPath, filename);

    // 5. Write to disk
    await fs.writeFile(filePath, response.data);

    // 6. Save to database
    const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');
    
    try {
      await query(`
        INSERT INTO media (filename, original_name, mime_type, size, path, alt_text, title, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        filename.substring(0, 255),
        imageUrl.substring(0, 255),
        (contentType || 'image/jpeg').substring(0, 100),
        response.data.length,
        relativePath.substring(0, 500),
        (altText || '').substring(0, 255),
        originalFilename.substring(0, 255),
        userId
      ]);
    } catch (dbErr) {
      console.error('[WebWolf:mediaService] DB insert failed:', dbErr.message);
    }

    const localUrl = `/uploads${relativePath}`;
    info(dbName, 'IMAGE_DOWNLOADED', `Downloaded ${imageUrl} to ${localUrl}`);
    
    return localUrl;
  } catch (err) {
    console.error(`[WebWolf:mediaService] Failed to download image ${url}:`, err.message);
    logError(dbName, err, 'IMAGE_DOWNLOAD_FAILED', { url });
    return url; // Fallback to original URL
  }
}

/**
 * Process HTML content to find all <img> tags, download the images, 
 * and rewrite the src attributes to point to the local copies.
 */
export async function processHtmlImages(html, userId = null) {
  if (!html) return html;
  
  const $ = cheerio.load(html, null, false); // null, false means do not wrap in body/html
  const images = $('img');
  
  if (images.length === 0) return html;

  const downloadPromises = [];
  
  images.each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('http')) {
      const alt = $(el).attr('alt') || '';
      downloadPromises.push(
        downloadImage(src, alt, userId).then(localUrl => {
          $(el).attr('src', localUrl);
          // Also handle srcset if present
          if ($(el).attr('srcset')) {
            $(el).removeAttr('srcset'); // Simplest approach: remove srcset as we only have one local size
          }
        })
      );
    }
  });

  if (downloadPromises.length > 0) {
    await Promise.all(downloadPromises);
    return $.html();
  }
  
  return html;
}
