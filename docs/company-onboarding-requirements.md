# PayForMe — Company & Business Verification Requirements

**Version:** 1.0  
**Purpose:** Standard Know-Your-Business (KYB) pack for payment, SMS, banking, and cloud provider onboarding  
**Audience:** PayForMe operations, compliance, and external partners (MTN MoMo, Arkesel, banks, cloud vendors)

---

## 1. Overview

Before activating **SMS**, **MoMo**, **Partner Bank API**, or **production cloud storage**, PayForMe must submit verified company documents proving the business legally exists and is authorized to operate.

This document lists required company details and supporting documents. Keep originals secure; share **certified copies** or **PDF scans** only through approved channels.

---

## 2. Company details (required fields)

Complete this section in every partner application form.

| Field | Description | Example / format |
|-------|-------------|------------------|
| **Legal entity name** | Full registered name | PayForMe Ghana Ltd |
| **Trading / brand name** | Name shown to customers | PayForMe |
| **Entity type** | Company structure | Private Limited Company |
| **Country of incorporation** | Jurisdiction | Ghana |
| **Date of incorporation** | From Certificate of Incorporation | YYYY-MM-DD |
| **Certificate of Incorporation number** | RGD / Registrar number | CA-12345678 |
| **Business Registration number** | Ghana RGD unique ID | BN1234567890123 |
| **Tax Identification Number (TIN)** | GRA-issued TIN | C0012345678 |
| **VAT registration number** | If VAT-registered | VRA123456789 |
| **SSNIT employer number** | If applicable | — |
| **Industry / sector** | NACE or free text | Financial technology / PropTech |
| **Registered office address** | Full postal address | Plot 12, Accra, Ghana |
| **Operational / trading address** | If different from registered | — |
| **Company email (official)** | Domain-matched preferred | compliance@payforme.com |
| **Company phone** | Main line | +233 XX XXX XXXX |
| **Website** | Live URL | https://payforme.com |
| **Primary contact name** | Authorized signatory | — |
| **Primary contact title** | e.g. CEO, Compliance Officer | — |
| **Primary contact email & phone** | For provider follow-up | — |

---

## 3. Mandatory documents

### 3.1 Proof of legal existence

| # | Document | Notes |
|---|----------|--------|
| 1 | **Certificate of Incorporation** | Issued by Registrar General’s Department (Ghana) or equivalent |
| 2 | **Companies Regulations / Constitution** | Memorandum & Articles of Association |
| 3 | **Certificate of Commencement of Business** | If required for your entity type |
| 4 | **Business operating license** | Sector-specific license if regulated (e.g. rental, lending support services) |
| 5 | **Proof of business address** | Utility bill, lease agreement, or bank statement (≤ 3 months old) |

### 3.2 Tax & regulatory identification

| # | Document | Notes |
|---|----------|--------|
| 6 | **TIN certificate** | Ghana Revenue Authority |
| 7 | **VAT registration certificate** | If applicable |
| 8 | **Tax clearance certificate** | Recent, if requested by partner |
| 9 | **Data Protection Commission registration** | Ghana DPA Act compliance (if processing personal data at scale) |

### 3.3 Ownership & control

| # | Document | Notes |
|---|----------|--------|
| 10 | **Register of directors** | Current list from RGD or internal register |
| 11 | **Beneficial ownership declaration** | UBOs with ≥ 25% ownership |
| 12 | **Valid Ghana Card / passport** | For each director and UBO |
| 13 | **Board resolution** | Authorizing integration signatory to bind the company |

### 3.4 Financial & banking

| # | Document | Notes |
|---|----------|--------|
| 14 | **Corporate bank account details** | Bank name, branch, account name, account number |
| 15 | **Bank reference / account confirmation letter** | On bank letterhead |
| 16 | **Audited financial statements** | Latest year, if requested by MoMo or bank partners |

### 3.5 Compliance & policies (recommended for fintech / payments)

| # | Document | Notes |
|---|----------|--------|
| 17 | **AML / CFT policy** | Anti-money laundering programme |
| 18 | **KYC / customer due diligence policy** | How users are verified |
| 19 | **Privacy policy & data processing notice** | Published on website |
| 20 | **Complaints & dispute handling procedure** | Customer redress |
| 21 | **Information security policy** | For cloud and API partners |

---

## 4. Provider-specific extras

| Provider | Additional requirements |
|----------|-------------------------|
| **MTN MoMo** | Merchant agreement, callback URL (HTTPS), business category, estimated transaction volume |
| **Arkesel SMS** | Approved **Sender ID** (max 11 chars), use case description, sample message templates |
| **Partner banks** | GhIPSS participation or sponsor bank letter, API security review, settlement account |
| **Cloudflare R2 / AWS** | Billing identity, acceptable use compliance, DPA if enterprise |

---

## 5. Submission checklist

- [ ] All company detail fields completed (Section 2)
- [ ] Certificate of Incorporation uploaded
- [ ] TIN / business registration numbers verified against documents
- [ ] Directors and UBO IDs collected
- [ ] Corporate bank account confirmation obtained
- [ ] Authorized signatory board resolution attached
- [ ] Privacy policy and terms live on production website
- [ ] Compliance officer assigned internally
- [ ] Documents stored in secure compliance folder (not in git)

---

## 6. Internal storage

Store KYB documents in:

- **Private cloud storage** (`private/compliance/kyb/`) — see [Cloud storage guide](./cloud-storage-setup.md)
- Access via admin/compliance roles only
- Audit every download (`FILE_ACCESS` logs)

Never commit certificates, TIN scans, or API secrets to the repository.

---

## 7. Related integration guides

| Integration | Documentation |
|-------------|----------------|
| **Documents per integration (matrix)** | [integration-business-documents.md](./integration-business-documents.md) |
| SMS (Arkesel / Hubtel) | [sms-integration.md](./sms-integration.md) |
| MoMo payments | [momo-integration.md](./momo-integration.md) |
| Document storage (R2 / S3) | [cloud-storage-setup.md](./cloud-storage-setup.md) |
| Partner Bank API | [bank-partner-api.md](./bank-partner-api.md) |
| Full platform pack | [platform-integrations-guide.md](./platform-integrations-guide.md) |

---

## 8. Contact

For partner onboarding submissions, use the official compliance contact registered with each provider. Include legal entity name and TIN on all correspondence.
