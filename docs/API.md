# RentVest API Documentation

Base URL: `/api`

## Authentication

Browser apps use Auth.js **session cookies** after login.

API/mobile clients may use JWT:

1. Sign in via `/login` or obtain tokens from `POST /api/auth/refresh` with a refresh token.
2. Send `Authorization: Bearer <access_token>` on protected routes.

### POST `/api/auth/register`

```json
{
  "email": "user@example.com",
  "password": "SecurePass1",
  "fullName": "John Doe",
  "phone": "+233200000000",
  "role": "BUYER"
}
```

### POST `/api/auth/refresh`

```json
{ "refreshToken": "..." }
```

Returns `{ accessToken, refreshToken }`.

### GET `/api/auth/2fa`

Returns `{ enabled, pendingSetup }`.

### POST `/api/auth/2fa`

```json
{ "action": "enable" }
```

```json
{ "action": "verify", "token": "123456" }
```

```json
{ "action": "disable", "token": "123456" }
```

## Settings & KYC

### GET/PATCH `/api/settings`

Profile email, password, image; returns `twoFactorEnabled`.

### GET/POST `/api/settings/bank-account`

Add payout accounts (bank or MoMo).

### GET/POST `/api/kyc`

Profile, Ghana Card, and bank account verification actions.

## Properties

### GET `/api/properties?search=&page=1&limit=12`

List active properties (public; premium listing limits apply).

### GET `/api/properties/:id`

Property details (public).

### POST `/api/properties`

Create listing (Landlord).

### GET `/api/properties/listing-limits`

Current plan limits for the authenticated user.

### GET/POST/DELETE `/api/properties/saved`

Saved properties (Tenant).

## Landlord agents

### GET `/api/merchant/agents`

List landlord properties with assigned agents and available platform agents.

### PATCH `/api/merchant/agents`

```json
{ "propertyId": "...", "agentProfileId": "..." }
```

Pass `agentProfileId: null` to unassign.

## Financing

### GET `/api/financing`

Tenant: own requests. Lender: pending requests.

### POST `/api/financing`

Create financing request (Tenant; requires approved application).

### POST `/api/financing/approve`

Approve and fund (Lender).

### POST `/api/financing/reject`

Reject request (Lender).

### GET/POST `/api/financing/installments`

Tenant repayment schedule and pay installment.

## Mandates

### GET/POST `/api/mandates`

List or create repayment mandates (Tenant).

### POST `/api/mandates/:id/upload`

Upload scanned mandate form.

### PATCH `/api/mandates/:id/review`

Admin mandate review.

## Wallet & payments

### GET `/api/wallet`

Balance and transaction history.

### POST `/api/payments/deposit`

Deposit via a **verified saved account** from Settings:

```json
{
  "amount": 1000,
  "bankAccountId": "cl..."
}
```

- **MoMo** — Hubtel payment prompt to saved number
- **Bank** — Hubtel checkout redirect

### POST `/api/payments/momo`

Deprecated alias for deposit (requires `bankAccountId`).

### GET `/api/payments/deposit?reference=...`

Poll deposit status.

### POST `/api/webhooks/payments/hubtel`

Hubtel payment callback (public; configure in Hubtel dashboard).

## Withdrawals

### GET/POST `/api/withdrawals`

List or request withdrawal.

### POST `/api/withdrawals/verify`

```json
{ "withdrawalId": "...", "code": "123456" }
```

### POST `/api/withdrawals/confirm`

```json
{ "withdrawalId": "...", "twoFaToken": "123456" }
```

Requires **2FA enabled** in Settings.

## Subscriptions

### GET `/api/subscriptions/plans`

Public plan listing (Free, Premium).

### GET/POST `/api/subscriptions`

Current subscription / upgrade / cancel.

> Premium upgrades are recorded in-app. Payment collection for subscription renewals is not yet integrated.

## Messages & notifications

### GET/POST `/api/messages`

List conversations / send message.

### GET `/api/messages/:conversationId`

Fetch messages for a conversation.

### GET/PATCH `/api/notifications`

Unread notifications; mark as read with `{ "id": "..." }`.

## Applications

### GET/POST `/api/applications`

Tenant applications to properties.

### POST `/api/applications/:id/review`

Landlord/agent review.

## Settlements

### GET `/api/settlements`

Landlord settlement history.

### PATCH `/api/settlements`

Admin mark settlement completed.

## Admin

### GET `/api/admin/users?role=BUYER&page=1`

### GET `/api/admin/stats`

### GET `/api/admin/transactions`

### GET `/api/admin/commissions`

### GET `/api/admin/subscriptions`

### GET/PATCH `/api/admin/reviews`

KYC, mandate, and reconciliation review queues.

## Analytics

### GET `/api/analytics/ceo`

Admin analytics metrics (admin role only).

## Cron (internal)

Requires header `Authorization: Bearer <CRON_SECRET>` in production.

### POST `/api/cron/repayments`

Process due installments and poll mandate status.

### POST `/api/cron/subscriptions`

Expire Premium subscriptions past `endDate`.

Scheduled on Vercel via `vercel.json` (daily).

## Rate limiting

Default: 100 requests per minute per IP (Redis or in-memory).

## Error format

```json
{
  "success": false,
  "message": "...",
  "errors": [{ "code": "ERROR_CODE", "message": "..." }],
  "requestId": "..."
}
```

## Partner Bank API

Banks integrating with PayForMe (wallet deposits, withdrawals, mandate debits, collection account) should use the dedicated partner specification:

- **Markdown:** [docs/bank-partner-api.md](./bank-partner-api.md)
- **PDF:** [docs/bank-partner-api.pdf](./bank-partner-api.pdf) (regenerate with `npm run docs:bank-partner-pdf`)

**Live today**

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/bank/v1/health` | `x-bank-api-key` |
| `POST` | `/api/bank/v1/deposits` | `x-bank-api-key` |
| `POST` | `/api/bank/v1/withdrawals` | `x-bank-api-key` |
| `POST` | `/api/bank/v1/withdrawals/initiate` | `x-bank-api-key` |
| `PATCH` | `/api/bank/v1/withdrawals/{id}` | `x-bank-api-key` |
| `POST` | `/api/bank/v1/charges` | `x-bank-api-key` |
| `GET` | `/api/bank/v1/transactions/{reference}` | `x-bank-api-key` |
| `GET` | `/api/bank/v1/users/lookup` | `x-bank-api-key` |
| `POST` | `/api/bank/v1/mandates/callback` | `x-bank-api-key` |
| `POST` | `/api/webhooks/bank` | `x-bank-api-key` + optional HMAC |
| `POST` | `/api/payments/bank-deposit-instructions` | Session (user) |
| `GET/POST` | `/api/admin/settlement-account` | Admin session |

Configure `BANK_API_KEY` in `.env`. Run `npm run db:bank-partner` after pulling. See the partner doc for request/response shapes, status lifecycle, and repayment charging.

## Integration gaps (external setup required)

| Feature | Status |
|---------|--------|
| Hubtel live payments | Configure `HUBTEL_*` env vars + public webhook |
| Dojah automated KYC | Configure `KYC_PROVIDER=dojah` + Dojah keys |
| Bank mandate / direct debit | Configure `BANK_API_KEY` + `BANK_API_URL`; see [bank-partner-api.md](./bank-partner-api.md) |
| Subscription payment collection | Not implemented — plan changes are in-app only |
