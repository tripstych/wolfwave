# Plan: S3 Media Storage with IAM Role + External ID (Per-Tenant)

## Overview

Replace local filesystem media storage with S3, using AWS IAM role assumption with external IDs for secure access. Each tenant can configure their own S3 bucket/role, falling back to the default/admin tenant's S3 config if unconfigured.

---

## 1. Install AWS SDK

```bash
npm install @aws-sdk/client-s3 @aws-sdk/client-sts
```

- `@aws-sdk/client-s3` — S3 operations (PutObject, DeleteObject, HeadBucket)
- `@aws-sdk/client-sts` — AssumeRole with external ID

---

## 2. New Service: `server/services/s3Service.js`

Responsible for all S3 interactions with IAM role assumption.

**Key functions:**

- `getS3Config(tenantDbName)` — Reads the tenant's S3 settings from their DB. If not configured, reads from `wolfwave_default` DB instead (the fallback).
- `getS3Client(config)` — Uses STS `AssumeRole` with the provided role ARN + external ID to get temporary credentials, then returns an S3 client. Caches credentials until near expiry.
- `uploadToS3(buffer, key, contentType)` — PutObject to the configured bucket.
- `deleteFromS3(key)` — DeleteObject from S3.
- `getS3Url(key, config)` — Returns the public URL (`https://{bucket}.s3.{region}.amazonaws.com/{key}`).
- `testS3Connection(config)` — HeadBucket call to verify access.

**Settings keys (stored in tenant's `settings` table):**
- `s3_bucket_name` — The S3 bucket name
- `s3_region` — AWS region (e.g. `us-east-1`)
- `s3_role_arn` — The IAM role ARN to assume
- `s3_external_id` — The external ID for role assumption
- `s3_prefix` — Optional key prefix (defaults to tenant subdomain)

**Fallback logic:**
```
1. Read s3_bucket_name from current tenant's settings
2. If empty → read all s3_* settings from wolfwave_default DB
3. If still empty → fall back to local filesystem (existing behavior unchanged)
```

---

## 3. Modify `server/services/mediaService.js`

Update `downloadMedia()`:

- After downloading/receiving the file buffer, check if S3 is configured via `getS3Config()`
- If S3 configured: upload buffer via `uploadToS3()`, store S3 key in `media.path`, return full S3 URL
- If not configured: keep existing local filesystem behavior (no breaking change)

---

## 4. Modify `server/api/media.js`

Update upload endpoints:

- Change multer from `diskStorage` to `memoryStorage` (gives us a buffer)
- After multer processes the file, check if S3 is configured
- If yes: upload `req.file.buffer` to S3, store S3 key in DB, return S3 URL
- If no: write to local disk as before (recreate the local write logic)
- Update delete endpoint: if path looks like an S3 key, call `deleteFromS3()`; otherwise `fs.unlink()` as before

---

## 5. Modify `server/index.js` — Upload Serving

Since S3 media will use full absolute URLs (e.g. `https://bucket.s3.us-east-1.amazonaws.com/...`), the existing `/uploads` static middleware continues working for legacy local files. No changes needed here — new S3 media simply won't hit this route.

---

## 6. Add Storage Tab to Admin UI — `admin/src/settings/Settings.jsx`

Add a new **"Storage"** tab with a cloud/hard-drive icon:

**Fields:**
- S3 Bucket Name (`s3_bucket_name`) — text
- AWS Region (`s3_region`) — dropdown with common regions
- IAM Role ARN (`s3_role_arn`) — text, placeholder: `arn:aws:iam::123456789012:role/...`
- External ID (`s3_external_id`) — text
- Key Prefix (`s3_prefix`) — text, optional, hint: "defaults to tenant name"
- **"Test Connection"** button — calls `POST /api/settings/test-s3`

**Info text:** Explain that if left blank, the default/admin tenant's S3 config is used. If the admin also has no S3 config, files are stored locally.

---

## 7. New API Endpoint: `POST /api/settings/test-s3`

Add to `server/api/settings.js`:

- Accepts S3 settings in request body
- Attempts `AssumeRole` with the provided ARN + external ID
- Attempts `HeadBucket` to verify bucket access
- Returns `{ success: true }` or `{ success: false, error: "..." }`
- Protected by `requireAuth + requireAdmin`

---

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `@aws-sdk/client-s3`, `@aws-sdk/client-sts` |
| `server/services/s3Service.js` | **NEW** — S3 client, role assumption, upload/delete/URL |
| `server/services/mediaService.js` | Use S3 when configured, local fallback |
| `server/api/media.js` | memoryStorage, S3 upload/delete with local fallback |
| `server/api/settings.js` | Add `POST /test-s3` endpoint |
| `admin/src/settings/Settings.jsx` | Add Storage tab with S3 fields + test button |

## Not in Scope

- No CloudFront/CDN setup (can be layered on later)
- No migration of existing local files to S3
- No presigned upload (files still go through our server)
- No Prisma schema changes (settings table handles key-value pairs already)
