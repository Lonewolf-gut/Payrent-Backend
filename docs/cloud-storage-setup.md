# Cloud document storage setup

**Prerequisite:** Complete [Company onboarding requirements](./company-onboarding-requirements.md) before storing production KYC and compliance documents.

PayForMe stores **sensitive documents privately** (KYC, financing, applications, mandates) and **public assets** (property photos, profile images) through a unified storage layer.

## How it works

| Document type | Visibility | Storage |
|---------------|------------|---------|
| KYC / identity | Private | S3 or `storage/private/` locally |
| Financing docs | Private | S3 or `storage/private/` locally |
| Application docs | Private | S3 or `storage/private/` locally |
| Mandates | Private | S3 or `storage/private/` locally |
| Property images | Public | S3 CDN or `public/uploads/` locally |
| Profile photos | Public | S3 CDN or `public/uploads/` locally |

The database stores a **storage key** (for example `private/kyc/{userId}/{file}.pdf`), not the file bytes.

Admins, compliance officers, and document owners request a **short-lived signed URL** via `POST /api/files/access`. Each access is written to `AuditLog` with action `FILE_ACCESS`.

## Environment variables

### Local development (default)

```env
STORAGE_DRIVER=local
FILE_MAX_SIZE_MB=10
FILE_SIGNED_URL_TTL_SECONDS=900
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- Private files: `storage/private/` (not web-accessible)
- Public files: `public/uploads/` (same URLs as before)

### Production (AWS S3)

```env
STORAGE_DRIVER=s3
S3_BUCKET=payforme-uploads
S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_URL=https://payforme-uploads.s3.eu-west-1.amazonaws.com
FILE_MAX_SIZE_MB=10
FILE_SIGNED_URL_TTL_SECONDS=900
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Cloudflare R2 (S3-compatible)

```env
STORAGE_DRIVER=s3
S3_BUCKET=payforme-uploads
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-r2-access-key
S3_SECRET_ACCESS_KEY=your-r2-secret-key
S3_PUBLIC_URL=https://cdn.yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### DigitalOcean Spaces

```env
STORAGE_DRIVER=s3
S3_BUCKET=payforme
S3_REGION=nyc3
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_ACCESS_KEY_ID=your-spaces-key
S3_SECRET_ACCESS_KEY=your-spaces-secret
S3_PUBLIC_URL=https://payforme.nyc3.cdn.digitaloceanspaces.com
```

## AWS S3 setup (step by step)

1. **Create a bucket** (e.g. `payforme-uploads-prod`) in your preferred region.
2. **Block all public access** on the bucket (default). Private KYC files must never be public.
3. **Create an IAM user** with programmatic access and attach a policy like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::payforme-uploads-prod/*"
    }
  ]
}
```

4. Copy the **Access key** and **Secret** into your `.env`.
5. For **public property images**, either:
   - Serve via `S3_PUBLIC_URL` + bucket policy allowing `public/properties/*` read, or
   - Put CloudFront in front of that prefix only.
6. Set `STORAGE_DRIVER=s3` and restart the app.

## Cloudflare R2 setup (cheaper, S3-compatible)

1. In Cloudflare dashboard → **R2** → **Create bucket**.
2. **Manage R2 API tokens** → create token with Object Read & Write.
3. Set `S3_ENDPOINT` to your R2 endpoint (shown in the dashboard).
4. Set `S3_REGION=auto`.
5. Optional: connect a custom domain for public property images (`S3_PUBLIC_URL`).

## Allowed uploads

- **Documents:** PDF, JPG, PNG, WEBP, GIF (max 10 MB by default)
- **Images:** JPG, PNG, WEBP, GIF

## Migrating existing local files

Old paths like `/uploads/kyc/...` are mapped automatically when requesting access. For production, re-upload or copy files into the new bucket under the `private/` prefix, then update `fileUrl` in the database to the storage key format (`private/kyc/...`).

## Security checklist

- [ ] `STORAGE_DRIVER=s3` in production
- [ ] Bucket blocks public access (except optional `public/` prefix)
- [ ] IAM/R2 credentials only on the server (never in git)
- [ ] `NEXT_PUBLIC_APP_URL` matches your live domain
- [ ] Compliance team uses admin UI (signed URLs, audit logged)
- [ ] Enable bucket versioning + lifecycle rules for retention

## Related documentation

- [Company onboarding & KYB documents](./company-onboarding-requirements.md)
- [SMS integration](./sms-integration.md)
- [MoMo integration](./momo-integration.md)
- [Platform integrations guide](./platform-integrations-guide.md)
- Env template: [storage-env.example.txt](./storage-env.example.txt)
