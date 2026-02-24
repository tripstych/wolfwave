import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { getS3Config, uploadToS3, deleteFromS3, buildS3Key } from '../services/s3Service.js';

/**
 * Build an S3 key from a media record's relative path (e.g. /2026/02/uuid.jpg).
 */
function buildS3KeyFromPath(s3Config, mediaPath) {
  // mediaPath is stored as e.g. /2026/02/uuid.jpg — strip leading slash
  const cleaned = mediaPath.replace(/^\//, '');
  return buildS3Key(s3Config, cleaned);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

// Ensure base uploads directory exists
await fs.mkdir(UPLOADS_ROOT, { recursive: true });

/**
 * Get the tenant-specific uploads directory.
 * Falls back to a '_default' subdirectory for the primary site.
 */
function getTenantUploadsDir() {
  const dbName = getCurrentDbName();
  const subdomain = dbName.replace(/^webwolf_/, '') || '_default';
  return path.join(UPLOADS_ROOT, subdomain);
}

// Use memory storage so we can upload to S3 or write to disk
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  const forbiddenExts = ['.exe', '.php', '.js', '.sh', '.bat', '.cmd', '.config'];
  
  if (forbiddenExts.includes(ext)) {
    return cb(new Error('Dangerous file extension blocked'), false);
  }
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const router = Router();

// List all media
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;

    const pageNum = Math.max(1, Number.parseInt(String(pageRaw ?? '1'), 10) || 1);
    const limitNum = Math.min(200, Math.max(1, Number.parseInt(String(limitRaw ?? '50'), 10) || 50));
    const offsetNum = (pageNum - 1) * limitNum;

    console.log('[WebWolf:media]', {
      type,
      page: pageNum,
      limit: limitNum,
      offset: offsetNum
    });
    
    let sql = 'SELECT * FROM media';
    const params = [];
    
    if (type === 'image') {
      sql += ' WHERE mime_type LIKE ?';
      params.push('image/%');
    } else if (type === 'document') {
      sql += ' WHERE mime_type NOT LIKE ?';
      params.push('image/%');
    }
    
    // Some MySQL/MariaDB configs do not accept prepared statement placeholders for LIMIT/OFFSET.
    // These values are sanitized integers, so inlining is safe here.
    sql += ` ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
    
    const media = await query(sql, params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM media';
    const countParams = [];
    
    if (type === 'image') {
      countSql += ' WHERE mime_type LIKE ?';
      countParams.push('image/%');
    } else if (type === 'document') {
      countSql += ' WHERE mime_type NOT LIKE ?';
      countParams.push('image/%');
    }
    
    const [{ total }] = await query(countSql, countParams);
    
    res.json({
      media,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List media error:', err);
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// Get single media item
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const media = await query('SELECT * FROM media WHERE id = ?', [req.params.id]);
    
    if (!media[0]) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json(media[0]);
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// Upload media
router.post('/upload', requireAuth, requireEditor, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { alt_text, title } = req.body;
    const ext = path.extname(req.file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const date = new Date();
    const subdir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');

    // Upload to S3 or write to local disk
    const s3Config = await getS3Config();
    let fileUrl;
    if (s3Config) {
      fileUrl = await uploadToS3(s3Config, req.file.buffer, `${subdir}/${filename}`, req.file.mimetype);
    } else {
      const tenantDir = getTenantUploadsDir();
      const fullPath = path.join(tenantDir, subdir);
      await fs.mkdir(fullPath, { recursive: true });
      await fs.writeFile(path.join(fullPath, filename), req.file.buffer);
      fileUrl = `/uploads${relativePath}`;
    }

    const result = await query(`
      INSERT INTO media (filename, original_name, mime_type, size, path, alt_text, title, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      relativePath,
      alt_text || '',
      title || req.file.originalname,
      req.user.id
    ]);

    res.status(201).json({
      id: result.insertId,
      filename,
      path: fileUrl,
      url: fileUrl
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload multiple files
router.post('/upload/multiple', requireAuth, requireEditor, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const s3Config = await getS3Config();
    const results = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      const date = new Date();
      const subdir = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      const relativePath = `/${subdir}/${filename}`.replace(/\\/g, '/');

      let fileUrl;
      if (s3Config) {
        fileUrl = await uploadToS3(s3Config, file.buffer, `${subdir}/${filename}`, file.mimetype);
      } else {
        const tenantDir = getTenantUploadsDir();
        const fullPath = path.join(tenantDir, subdir);
        await fs.mkdir(fullPath, { recursive: true });
        await fs.writeFile(path.join(fullPath, filename), file.buffer);
        fileUrl = `/uploads${relativePath}`;
      }

      const result = await query(`
        INSERT INTO media (filename, original_name, mime_type, size, path, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        filename,
        file.originalname,
        file.mimetype,
        file.size,
        relativePath,
        req.user.id
      ]);

      results.push({
        id: result.insertId,
        filename,
        path: fileUrl,
        url: fileUrl
      });
    }

    res.status(201).json(results);
  } catch (err) {
    console.error('Multiple upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Update media metadata
router.put('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const { alt_text, title } = req.body;
    
    await query(
      'UPDATE media SET alt_text = ?, title = ? WHERE id = ?',
      [alt_text || '', title || '', req.params.id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update media error:', err);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

// Delete media
router.delete('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const media = await query('SELECT * FROM media WHERE id = ?', [req.params.id]);

    if (!media[0]) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Delete file from S3 or local filesystem
    const s3Config = await getS3Config();
    if (s3Config) {
      // Try to extract S3 key — check if we stored the path as a relative path
      const s3Key = buildS3KeyFromPath(s3Config, media[0].path);
      try {
        await deleteFromS3(s3Config, s3Key);
      } catch (err) {
        console.warn('Could not delete from S3:', err.message);
      }
    } else {
      const filePath = path.join(getTenantUploadsDir(), media[0].path);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn('Could not delete file:', err.message);
      }
    }

    // Delete from database
    await query('DELETE FROM media WHERE id = ?', [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;
