# PayForMe — Platform Integrations Guide

**Version:** 1.0  
**Includes:** Company verification · SMS · MoMo · Cloud storage  
**Audience:** Operations, compliance, and technology partners

---

> **Start here for KYB:** [integration-business-documents.md](./integration-business-documents.md) — **4 core documents for all integrations**, plus extras per provider (Arkesel, Hubtel SMS, MoMo, Cloudflare R2).

---

# Part A — Company & business verification

*KYB matrix: [integration-business-documents.md](./integration-business-documents.md)*  
*Full detail: [company-onboarding-requirements.md](./company-onboarding-requirements.md)*

## Required company details

| Field | Description |
|-------|-------------|
| Legal entity name | Full registered company name |
| Trading name | Customer-facing brand (e.g. PayForMe) |
| Certificate of Incorporation number | Registrar-issued |
| Business Registration number | Ghana RGD / equivalent |
| TIN | Tax Identification Number |
| VAT number | If applicable |
| Registered & operational address | Full postal addresses |
| Directors & beneficial owners | IDs and ownership declaration |

## Mandatory documents

1. **Certificate of Incorporation**
2. **Memorandum & Articles / Constitution**
3. **Business operating license** (if regulated sector)
4. **Proof of business address** (utility bill or lease, ≤ 3 months)
5. **TIN certificate**
6. **Register of directors + UBO declaration**
7. **Director / UBO Ghana Card or passport**
8. **Board resolution** authorizing signatory
9. **Corporate bank account confirmation letter**
10. **AML/KYC and privacy policies** (for payment & cloud partners)

Submit KYB before activating SMS Sender ID, MoMo merchant account, bank API, or production cloud bucket.

---

# Part B — SMS (Arkesel)

*Full document: [sms-integration.md](./sms-integration.md)*

## Quick setup

```env
SMS_PROVIDER=arkesel
SMS_API_KEY=your_arkesel_api_key
ARKESEL_SMS_SENDER_ID=PayForMe
ARKESEL_SMS_API_VERSION=legacy
SMS_API_URL=https://sms.arkesel.com/sms/api
```

## Use cases

- Phone verification OTP
- Withdrawal OTP
- Security SMS notifications

## Requirements

- Arkesel dashboard account + API key
- **Approved Sender ID** (max 11 characters)
- Company KYB documents (Part A)

---

# Part C — MTN MoMo payments

*Full document: [momo-integration.md](./momo-integration.md)*

## Quick setup

```env
PAYMENT_PROVIDER=momo
MOMO_SUBSCRIPTION_KEY=
MOMO_API_USER=
MOMO_API_KEY=
MOMO_API_URL=https://sandbox.momodeveloper.mtn.com
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_CURRENCY=EUR
MOMO_CALLBACK_URL=https://yourdomain.com/api/webhooks/payments/momo
```

## Use cases

- Wallet deposits (MoMo accounts)
- Subscription payments

## Sandbox notes

- URL: `https://sandbox.momodeveloper.mtn.com`
- Currency: `EUR` in sandbox, `GHS` in production
- **No real USSD prompt** in sandbox — use MTN developer simulator
- Webhook must be publicly reachable (HTTPS)

## Requirements

- MTN MoMo Developer portal account
- Collections API subscription
- Company KYB + merchant agreement

---

# Part D — Cloud document storage

*Full document: [cloud-storage-setup.md](./cloud-storage-setup.md)*

## Quick setup (Cloudflare R2 example)

```env
STORAGE_DRIVER=s3
S3_BUCKET=payforme
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=https://cdn.yourdomain.com
FILE_MAX_SIZE_MB=10
FILE_SIGNED_URL_TTL_SECONDS=900
```

## Storage model

| Content | Visibility | Access |
|---------|------------|--------|
| KYC, financing, mandates | Private | Signed URL + audit log |
| Property & profile images | Public | CDN / public prefix |

## API

- `POST /api/files/access` — short-lived signed URL for private documents
- All access logged as `FILE_ACCESS` in audit trail

## Requirements

- Cloud provider account (R2, AWS S3, or DigitalOcean Spaces)
- Company KYB for vendor billing identity
- Never commit secrets to git

---

# Part E — Partner Bank API

*Full document: [bank-partner-api.md](./bank-partner-api.md) · [PDF](./bank-partner-api.pdf)*

Bank deposits, withdrawals, installment charges, and webhooks for licensed partner banks.

```env
BANK_API_KEY=
BANK_WEBHOOK_SECRET=
```

---

# Document index

| Document | Markdown | PDF command |
|----------|----------|-------------|
| Company onboarding | `docs/company-onboarding-requirements.md` | `npm run docs:integrations-pdf` |
| SMS (Arkesel) | `docs/sms-integration.md` | ↑ |
| MoMo | `docs/momo-integration.md` | ↑ |
| Cloud storage | `docs/cloud-storage-setup.md` | ↑ |
| Combined guide | `docs/platform-integrations-guide.md` | ↑ |
| Bank Partner API | `docs/bank-partner-api.md` | `npm run docs:bank-partner-pdf` |

---

# Regenerate PDFs

```bash
npm run docs:integrations-pdf
```

Outputs to `docs/*.pdf` alongside each markdown file.
