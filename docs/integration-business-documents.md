# PayForMe — Business Documents by Integration

**Version:** 1.2  
**Purpose:** One checklist of company documents and which integration each is required for  
**Use this when:** Applying to Arkesel, Hubtel SMS, MTN MoMo, Cloudflare R2, or partner banks

**Cloud storage:** PayForMe uses **Cloudflare R2** (bucket: `payforme`). AWS S3 is not required.

---

## 1. Company details to prepare once

Fill these in once and reuse across all applications.

| Field | Example / notes |
|-------|-----------------|
| Legal entity name | PayForMe Ghana Ltd |
| Trading / brand name | PayForMe |
| Entity type | Private Limited Company |
| Country of incorporation | Ghana |
| Date of incorporation | From Certificate of Incorporation |
| **Certificate of Incorporation number** | RGD / Registrar number |
| **Business Registration number** | Ghana RGD unique ID |
| **TIN (Tax Identification Number)** | GRA-issued |
| VAT registration number | If VAT-registered |
| Registered office address | Full postal address |
| Operational address | If different from registered |
| Official company email | Prefer `@yourdomain.com` |
| Company phone & website | Live contact details |
| Authorized signatory | Name, title, ID, email, phone |
| Corporate bank account | Bank name, account name, account number |

---

## 2. Four core documents (all integrations)

Prepare **these four once**. Every provider below (SMS, MoMo, R2) will ask for them — submit the same copies each time.

| # | Document | What it proves |
|---|----------|----------------|
| **1** | **Certificate of Incorporation** | Legal existence (RGD) |
| **2** | **Business Registration certificate / extract** | Current registration with RGD |
| **3** | **TIN certificate** | Tax identity (GRA) |
| **4** | **Proof of business address** | Utility bill, lease, or bank statement (≤ 3 months) |

**Tip:** Scan all four to PDF, name them clearly (e.g. `01-incorporation.pdf`), and store in R2 at `private/compliance/kyb/` (see Section 7).

---

## 3. Extra documents by integration only

After the **four core documents**, each integration may ask for **additional** items.

### Legend

| Symbol | Meaning |
|--------|---------|
| **Required** | Must submit or provider will reject |
| **Often** | Commonly requested; have ready |
| **—** | Not typically needed |

---

### SMS — Arkesel

**Core 4:** ✓ all required

| Extra document | Required |
|----------------|----------|
| Sample SMS templates (OTP, withdrawal alerts, notifications) | **Required** |
| Approved **Sender ID** application (≤ 11 characters) | **Required** |
| Business operating license | Often |
| Register of directors | Often |
| Board resolution | Often |

**Also provide:** use case (verification OTP, withdrawal OTP, notifications), estimated monthly SMS volume.

---

### SMS — Hubtel

**Core 4:** ✓ all required

| Extra document | Required |
|----------------|----------|
| Sample SMS templates | **Required** |
| Hubtel merchant / SMS onboarding form | **Required** |
| Business operating license | Often |
| Register of directors | Often |
| Board resolution | Often |

**Env when approved:** `SMS_PROVIDER=hubtel`, `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`, `HUBTEL_SMS_SENDER_ID`

---

### MTN MoMo (Collections)

**Core 4:** ✓ all required — MoMo also needs the **heaviest extra pack**

| Extra document | Required |
|----------------|----------|
| Memorandum & Articles / Constitution | **Required** |
| Register of directors | **Required** |
| UBO (beneficial ownership) declaration | **Required** |
| UBO Ghana Cards / passports (≥ 25% owners) | **Required** |
| Board resolution (authorize signatory + MoMo agreement) | **Required** |
| Business operating license | **Required** |
| AML / CFT policy | **Required** |
| KYC / customer due diligence policy | **Required** |
| Terms of service (published) | **Required** |
| HTTPS callback URL (`/api/webhooks/payments/momo`) | **Required** |
| Technical contact (name, email, phone) | **Required** |
| MTN merchant / Collections agreement | **Required** |
| VAT registration certificate | Often |
| Audited financial statements | Often |
| Information security policy | Often |

**Also provide:** business category, estimated transaction volume, settlement account.

**Env when approved:** `PAYMENT_PROVIDER=momo`, `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY`, `MOMO_CALLBACK_URL`

---

### Cloud storage — Cloudflare R2 *(PayForMe default)*

**Core 4:** ✓ all required

| Extra document | Required |
|----------------|----------|
| Cloudflare account verification | **Required** |
| Corporate bank / card for R2 billing | **Required** |
| Information security policy | Often |
| Data Protection Commission registration (Ghana) | Often (storing KYC / personal data) |

**Use case to describe:** private KYC & financing documents, property images, signed URL access, audit logging. Bucket: `payforme`.

**Env when approved:**

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=payforme
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=auto
```

Setup guide: [cloud-storage-setup.md](./cloud-storage-setup.md)

---

## 4. Quick comparison matrix

| | Core 4 (all) | Arkesel SMS | Hubtel SMS | MTN MoMo | Cloudflare R2 |
|---|:---:|:---:|:---:|:---:|:---:|
| Certificate of Incorporation | ✓ | — | — | — | — |
| Business Registration | ✓ | — | — | — | — |
| TIN certificate | ✓ | — | — | — | — |
| Proof of address | ✓ | — | — | — | — |
| Sample SMS templates | — | ✓ | ✓ | — | — |
| Sender ID (Arkesel) | — | ✓ | — | — | — |
| Hubtel onboarding form | — | — | ✓ | — | — |
| UBO + board resolution | — | — | — | ✓ | — |
| AML / KYC / ToS policies | — | — | — | ✓ | — |
| MoMo callback URL + tech contact | — | — | — | ✓ | — |
| Cloudflare account verification | — | — | — | — | ✓ |
| Corporate bank / card (R2 billing) | — | — | — | — | ✓ |

**✓** in “Core 4” = prepare once for every integration. **—** in provider columns = covered by core 4.

---

## 5. Extended document reference (if a provider asks for more)

| # | Document | Typical use |
|---|----------|-------------|
| D2 | Memorandum & Articles | MoMo |
| D5 | VAT certificate | MoMo (if VAT-registered) |
| D6 | Business operating license | SMS, MoMo |
| D8 | Register of directors | SMS, MoMo |
| D9 | UBO declaration | MoMo |
| D10 | Director / signatory ID | SMS, MoMo (when requested) |
| D11 | Board resolution | SMS (often), MoMo (required) |
| D12 | Corporate bank account letter | MoMo, R2 billing |
| D13 | Audited financials | MoMo (often) |
| D14 | AML / CFT policy | MoMo |
| D15 | KYC policy | MoMo |
| D16 | Privacy policy (published) | SMS, MoMo, R2 (when requested) |
| D17 | Terms of service | MoMo |
| D18 | Information security policy | MoMo, R2 |
| D19 | Complaints procedure | Banks, some payment partners |
| D20 | DPA registration (Ghana) | R2 when storing personal/KYC data |
| D21 | Sample SMS templates | Arkesel, Hubtel |
| D22 | Live website / HTTPS URLs | SMS, MoMo callbacks (when requested) |
| D23 | Technical contact | MoMo, bank API |

---

## 6. Recommended submission order

1. **Prepare the core 4** — scan once, reuse everywhere  
2. **Cloudflare R2** — enable secure KYC storage in production (`payforme` bucket)  
3. **SMS** (Arkesel or Hubtel) — add SMS templates + Sender ID or Hubtel form  
4. **MTN MoMo** — submit when AML/KYC policies are ready  
5. **Partner Bank API** — see [bank-partner-api.md](./bank-partner-api.md)

---

## 7. Where documents are stored internally

- **R2 path:** `private/compliance/kyb/` on bucket `payforme`
- **Never** commit certificates, TIN scans, or API keys to git
- Access: admin / compliance roles only; downloads audit-logged

---

## 8. Technical setup guides (after KYB approved)

| Integration | Setup guide |
|-------------|-------------|
| Arkesel SMS | [sms-integration.md](./sms-integration.md) |
| Hubtel SMS | [sms-integration.md](./sms-integration.md) (Hubtel section) |
| MTN MoMo | [momo-integration.md](./momo-integration.md) |
| Cloudflare R2 | [cloud-storage-setup.md](./cloud-storage-setup.md) |
| Partner banks | [bank-partner-api.md](./bank-partner-api.md) |

---

## 9. PDF export

```bash
npm run docs:kyb-matrix-pdf
```

Output: `docs/integration-business-documents.pdf`
