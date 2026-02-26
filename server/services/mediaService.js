import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { query } from '../db/connection.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { getS3Config, uploadToS3 } from './s3Service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

/**
 * Download any generic asset (CSS, JS) and save it locally.
 * Does not register in the media library table.
 */
export async function downloadAsset(url) {
  const dbName = getCurrentDbName();
  try {
    if (!url || !url.startsWith('http')) return url;

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const date = new Date();
    const subdir = `assets/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const filename = `${uuidv4()}${path.extname(new URL(url).pathname) || '.css'}`;
    const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');

    const tenantDir = getTenantUploadsDir();
    const fullPath = path.join(tenantDir, subdir);
    await fs.mkdir(fullPath, { recursive: true });
    await fs.writeFile(path.join(fullPath, filename), response.data);

    return `/uploads${relativePath}`;
  } catch (err) {
    console.error(`[mediaService] Failed to download asset ${url}:`, err.message);
    return url;
  }
}

/**
 * Get the tenant-specific uploads directory.
 */
export function getTenantUploadsDir() {
  const dbName = getCurrentDbName();
  const subdomain = dbName.replace(/^wolfwave_/, '') || '_default';
  return path.join(UPLOADS_ROOT, subdomain);
}

/**
 * Download a media file (image or video) from a URL and save it to the local media library.
 * Returns the local URL of the saved file.
 */
export async function downloadMedia(url, altText = '', userId = null, strict = false) {
  const dbName = getCurrentDbName();
  try {
    if (!url || typeof url !== 'string') return url;
    if (!url.startsWith('http') && !url.startsWith('data:')) return url;

    // 1. Handle Data URIs (e.g. from Gemini Imagen)
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid data URI');

      const contentType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      const ext = '.' + (contentType.split('/')[1] || 'png');
      const filename = `${uuidv4()}${ext}`;
      const date = new Date();
      const subdir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');

      // Try S3 first, fall back to local
      const s3Config = await getS3Config();
      let fileUrl;
      if (s3Config) {
        fileUrl = await uploadToS3(s3Config, buffer, `${subdir}/${filename}`, contentType);
      } else {
        const tenantDir = getTenantUploadsDir();
        const fullPath = path.join(tenantDir, subdir);
        await fs.mkdir(fullPath, { recursive: true });
        await fs.writeFile(path.join(fullPath, filename), buffer);
        fileUrl = `/uploads${relativePath}`;
      }

      await query(`
        INSERT INTO media (filename, original_name, mime_type, size, path, alt_text, title, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [filename, 'ai-generated' + ext, contentType, buffer.length, relativePath, altText, 'AI Generated', userId]);

      return fileUrl;
    }

    // Normalize URL
    const mediaUrl = new URL(url).toString();

    // 1. Check if we already have this original URL to avoid duplicates
    const existing = await query('SELECT path FROM media WHERE original_name = ? OR original_name LIKE ? LIMIT 1', [mediaUrl, mediaUrl.substring(0, 250) + '%']);
    if (existing && existing.length > 0) {
      return `/uploads${existing[0].path}`;
    }
    
    // 2. Fetch the media
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // Increased timeout for videos
      maxContentLength: 50 * 1024 * 1024, // 50MB limit
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const contentType = response.headers['content-type'];
    const isImage = contentType?.startsWith('image/');
    const isVideo = contentType?.startsWith('video/');

    if (!isImage && !isVideo) {
      const ext = path.extname(new URL(mediaUrl).pathname).toLowerCase();
      const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.ogg', '.mov'];
      if (!validExts.includes(ext)) {
        throw new Error(`URL is not a supported media type: ${contentType}`);
      }
    }

    // 3. Prepare storage
    const date = new Date();
    const subdir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const urlObj = new URL(mediaUrl);
    const originalFilename = path.basename(urlObj.pathname) || 'imported-media';
    const ext = path.extname(originalFilename) || ('.' + (contentType ? contentType.split('/')[1] : 'dat'));
    const filename = `${uuidv4()}${ext}`;
    const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');

    // 4. Upload to S3 or write to local disk
    const s3Config = await getS3Config();
    let fileUrl;
    if (s3Config) {
      fileUrl = await uploadToS3(s3Config, Buffer.from(response.data), `${subdir}/${filename}`, contentType || (isImage ? 'image/jpeg' : 'video/mp4'));
    } else {
      const tenantDir = getTenantUploadsDir();
      const fullPath = path.join(tenantDir, subdir);
      await fs.mkdir(fullPath, { recursive: true });
      await fs.writeFile(path.join(fullPath, filename), response.data);
      fileUrl = `/uploads${relativePath}`;
    }

    // 5. Save to database
    try {
      await query(`
        INSERT INTO media (filename, original_name, mime_type, size, path, alt_text, title, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        filename.substring(0, 255),
        mediaUrl.substring(0, 255),
        (contentType || (isImage ? 'image/jpeg' : 'video/mp4')).substring(0, 100),
        response.data.length,
        relativePath.substring(0, 500),
        (altText || '').substring(0, 255),
        originalFilename.substring(0, 255),
        userId
      ]);
    } catch (dbErr) {
      console.error('[WebWolf:mediaService] DB insert failed:', dbErr.message);
      if (strict) throw dbErr;
    }

    info(dbName, 'MEDIA_DOWNLOADED', `Downloaded ${mediaUrl} to ${fileUrl}`);

    return fileUrl;
  } catch (err) {
    console.error(`[WebWolf:mediaService] Failed to download media ${url}:`, err.message);
    logError(dbName, err, 'MEDIA_DOWNLOAD_FAILED', { url });
    if (strict) throw err;
    return url; // Fallback to original URL
  }
}

// Alias for backward compatibility
export const downloadImage = downloadMedia;

/**
 * Process HTML content to find all <img> and <video> tags, download the media, 
 * and rewrite the attributes to point to the local copies.
 */
export async function processHtmlMedia(html, userId = null) {
  if (!html) return html;
  
  const $ = cheerio.load(html, null, false);
  const images = $('img');
  const videos = $('video, source');
  
  if (images.length === 0 && videos.length === 0) return html;

  const downloadPromises = [];
  
  images.each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('http')) {
      const alt = $(el).attr('alt') || '';
      downloadPromises.push(
        downloadMedia(src, alt, userId).then(localUrl => {
          $(el).attr('src', localUrl);
          if ($(el).attr('srcset')) $(el).removeAttr('srcset');
        })
      );
    }
  });

  videos.each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('http')) {
      downloadPromises.push(
        downloadMedia(src, '', userId).then(localUrl => {
          $(el).attr('src', localUrl);
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

// Alias for backward compatibility
export const processHtmlImages = processHtmlMedia;

/**
 * Register a local file in the media library.
 */
export async function registerMediaFile(relativePath, originalName, mimeType, size, userId = null) {
  const dbName = getCurrentDbName();
  try {
    const filename = path.basename(relativePath);
    const title = originalName || filename;
    
    // Check if already registered
    const existing = await query('SELECT id FROM media WHERE path = ? LIMIT 1', [relativePath]);
    if (existing && existing.length > 0) return existing[0].id;

    await query(`
      INSERT INTO media (filename, original_name, mime_type, size, path, alt_text, title, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      filename.substring(0, 255),
      (originalName || filename).substring(0, 255),
      (mimeType || 'application/octet-stream').substring(0, 100),
      size,
      relativePath.substring(0, 500),
      '',
      title.substring(0, 255),
      userId
    ]);
  } catch (err) {
    logError(dbName, err, 'MEDIA_REGISTRATION_FAILED', { path: relativePath });
  }
}

