# PayForMe — MTN MoMo Integration

**Version:** 1.0  
**Provider:** MTN Mobile Money (Collections API)  
**Prerequisite:** Complete [Company onboarding requirements](./company-onboarding-requirements.md) and MTN merchant / API approval

---

## 1. Overview

MoMo powers:

- **Wallet top-ups** (user deposits)
- **Subscription payments**
- USSD / app approval flow on the customer’s phone

Configure with `PAYMENT_PROVIDER=momo`. For local dev without keys, use `PAYMENT_PROVIDER=log`.

---

## 2. Prerequisites

| Requirement | Details |
|-------------|---------|
| MTN MoMo Developer account | https://momodeveloper.mtn.com |
| Collections product subscription | Subscription key from developer portal |
| API User + API Key | Created in MTN portal |
| HTTPS callback URL | Public webhook for payment status |
| Company KYB | Incorporation cert, TIN, business license — see [company onboarding](./company-onboarding-requirements.md) |
| Verified MoMo test number | Sandbox uses simulated approval (no real USSD to phone in sandbox) |

---

## 3. Environment variables

```env
PAYMENT_PROVIDER=momo

MOMO_SUBSCRIPTION_KEY=your-subscription-key
MOMO_API_USER=your-api-user-uuid
MOMO_API_KEY=your-api-key

# Sandbox (development)
MOMO_API_URL=https://sandbox.momodeveloper.mtn.com
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_CURRENCY=EUR

# Production (Ghana) — example
# MOMO_API_URL=https://proxy.momoapi.mtn.com
# MOMO_TARGET_ENVIRONMENT=mtnghana
# MOMO_CURRENCY=GHS

MOMO_CALLBACK_URL=https://yourdomain.com/api/webhooks/payments/momo
```

| Variable | Sandbox | Production |
|----------|---------|------------|
| `MOMO_API_URL` | `https://sandbox.momodeveloper.mtn.com` | MTN production proxy URL |
| `MOMO_TARGET_ENVIRONMENT` | `sandbox` | `mtnghana` (or per MTN docs) |
| `MOMO_CURRENCY` | `EUR` | `GHS` |
| `MOMO_CALLBACK_URL` | ngrok or public dev URL | HTTPS production domain |

---

## 4. Payment flow

```
User → Wallet → Deposit (MoMo account selected)
  → POST /api/payments/deposit
  → momo-payment.service / momo.service
  → POST {MOMO_API_URL}/collection/v1_0/requesttopay
  → User approves on phone (production) or sandbox simulator
  → POST /api/webhooks/payments/momo
  → completeWalletDeposit() → wallet credited + notification
```

**Status polling:** `GET /api/payments/deposit?reference=...`

---

## 5. API endpoints (MTN)

| MTN endpoint | Purpose |
|--------------|---------|
| `POST /collection/token/` | OAuth access token |
| `POST /collection/v1_0/requesttopay` | Initiate collection |
| `GET /collection/v1_0/requesttopay/{referenceId}` | Check status |

PayForMe webhook:

| Endpoint | Auth |
|----------|------|
| `POST /api/webhooks/payments/momo` | HMAC `x-signature` with `MOMO_API_KEY` |

---

## 6. Sandbox vs production

| | Sandbox | Production |
|---|---------|------------|
| URL | `sandbox.momodeveloper.mtn.com` | MTN production API host |
| Currency | `EUR` | `GHS` |
| Real USSD prompt | **No** — use developer portal simulator | Yes |
| Callback | Must be publicly reachable (ngrok for local) | HTTPS required |

**Important:** Sandbox does **not** send real payment prompts to customer phones. Use MTN’s sandbox UI to approve/decline test payments.

---

## 7. User experience

1. User adds **verified MoMo account** in Settings
2. User enters deposit amount in Wallet
3. App shows: *“Approve the prompt on your phone”*
4. On success: in-app + email notification, balance updates
5. **Bank account deposits** use Partner Bank API — not MoMo (see [bank-partner-api.md](./bank-partner-api.md))

---

## 8. Webhook payload (simplified)

```json
{
  "externalId": "MOMO-ABC12345",
  "amount": 100,
  "currency": "GHS",
  "status": "SUCCESSFUL",
  "payer": {
    "partyIdType": "MSISDN",
    "partyId": "233241234567"
  },
  "timestamp": "2026-07-25T12:00:00.000Z"
}
```

Idempotency: `externalId` maps to `WalletTransaction.reference`.

---

## 9. Troubleshooting

| Issue | Fix |
|-------|-----|
| “MoMo not configured” | Set all three: `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY` |
| No prompt on phone | Expected in **sandbox** — use simulator |
| Webhook not received | Check `MOMO_CALLBACK_URL` is public HTTPS; verify signature |
| Wrong API host | Use `sandbox.momodeveloper.mtn.com` not old `sandbox.momoapi.mtn.com` |
| Deposit stuck PENDING | Poll status endpoint; check webhook logs |
| Bank deposit fails | Bank accounts cannot use MoMo — use bank deposit instructions |

---

## 10. Security

- Store API keys only in server environment variables
- Verify webhook HMAC signature
- Use unique `externalId` per transaction
- Rotate keys if compromised

---

## 11. Related files

| Path | Purpose |
|------|---------|
| `lib/services/payment/momo.service.ts` | MTN API client |
| `lib/services/payment/momo-payment.service.ts` | Wallet deposit orchestration |
| `app/api/webhooks/payments/momo/route.ts` | Payment webhook |
| `app/api/payments/deposit/route.ts` | User deposit API |

---

## 12. Related documentation

- [Company onboarding](./company-onboarding-requirements.md)
- [Bank Partner API](./bank-partner-api.md) (bank deposits/withdrawals)
- [Platform integrations guide](./platform-integrations-guide.md) (combined PDF)
