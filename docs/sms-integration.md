# PayForMe — SMS Integration (Arkesel)

**Version:** 1.0  
**Provider:** [Arkesel](https://sms.arkesel.com) (recommended for Ghana)  
**Prerequisite:** Complete [Company onboarding requirements](./company-onboarding-requirements.md) and obtain an approved Sender ID

---

## 1. Overview

PayForMe uses SMS for:

- Phone verification (OTP)
- Withdrawal OTP
- Login / security alerts
- Notification delivery (when email + in-app are insufficient)

The default production provider is **Arkesel**. Development uses `SMS_PROVIDER=log` (console only).

---

## 2. Prerequisites

| Requirement | Details |
|-------------|---------|
| Arkesel account | Register at https://sms.arkesel.com |
| API key | Dashboard → API |
| Sender ID | Approved alphanumeric ID (max **11 characters**), e.g. `PayForMe` |
| Company KYB | Certificate of incorporation, TIN, business registration — see [company onboarding](./company-onboarding-requirements.md) |
| Ghana phone format | Numbers normalized to `+233XXXXXXXXX` |

---

## 3. Environment variables

```env
SMS_PROVIDER=arkesel

# Arkesel credentials
SMS_API_KEY=your_arkesel_api_key
ARKESEL_SMS_SENDER_ID=PayForMe
ARKESEL_SMS_API_VERSION=legacy
SMS_API_URL=https://sms.arkesel.com/sms/api
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SMS_PROVIDER` | Yes | `arkesel`, `hubtel`, `twilio`, or `log` |
| `SMS_API_KEY` | Yes (Arkesel) | API key from dashboard |
| `ARKESEL_SMS_SENDER_ID` | Yes | Approved sender name (≤ 11 chars) |
| `ARKESEL_SMS_API_VERSION` | No | `legacy` (default) or `v2` |
| `SMS_API_URL` | No | Default `https://sms.arkesel.com/sms/api` |

Ready-to-copy block: [`docs/arkesel-copy-to-env.txt`](./arkesel-copy-to-env.txt)

Windows helper: `powershell -File scripts/apply-arkesel-env.ps1`

---

## 4. How it works in the app

```
User action (verify phone, withdrawal, etc.)
  → notification.service / auth.service
  → sms.service.sendSms()
  → lib/integrations/sms/arkesel.ts
  → Arkesel HTTP API
```

**Legacy API (default):** GET request with query params `action=send-sms`, `api_key`, `to`, `from`, `sms`.

**V2 API:** Set `ARKESEL_SMS_API_VERSION=v2` → POST to `https://sms.arkesel.com/api/v2/sms/send`.

---

## 5. Phone number format

- Input: `0241234567`, `241234567`, `+233241234567`
- Normalized to Ghana international format before sending
- Arkesel receives digits without `+` prefix

---

## 6. SMS use cases in PayForMe

| Flow | Trigger | Channel |
|------|---------|---------|
| Phone verification | Register / resend OTP | SMS + email |
| Withdrawal OTP | Wallet withdrawal request | SMS + email |
| Security notifications | Optional per notification | SMS |

---

## 7. Testing

### Development (`SMS_PROVIDER=log`)

Messages are logged to the server console — no real SMS sent.

### Staging / production

1. Set `SMS_PROVIDER=arkesel` and valid API key
2. Use a real Ghana mobile number you control
3. Trigger phone verification from `/verify-phone`
4. Confirm delivery and Sender ID display on handset

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| SMS not sent | Check `SMS_API_KEY` and `ARKESEL_SMS_SENDER_ID` |
| Sender ID rejected | Ensure ID is **approved** in Arkesel dashboard |
| Invalid number | Use `+233` format; verify `normalizeGhanaPhone` |
| 401 / auth error | Regenerate API key; no extra spaces in `.env` |
| Works locally, not prod | Confirm env vars on hosting platform (Vercel, etc.) |

---

## 9. Security

- Never commit `SMS_API_KEY` to git
- Rotate keys if exposed
- Rate-limit OTP endpoints (built into app)
- Log provider responses server-side only

---

## 10. Alternative providers

| Provider | Env | Notes |
|----------|-----|-------|
| Hubtel | `SMS_PROVIDER=hubtel` | `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`, `HUBTEL_SMS_SENDER_ID` |
| Twilio | `SMS_PROVIDER=twilio` | International; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Log (dev) | `SMS_PROVIDER=log` | No external calls |

---

## 11. Related files

| Path | Purpose |
|------|---------|
| `lib/integrations/sms/arkesel.ts` | Arkesel HTTP client |
| `lib/services/sms.service.ts` | Provider routing |
| `scripts/apply-arkesel-env.ps1` | Windows env helper |
| `__tests__/arkesel-sms.test.ts` | Configuration tests |

---

## 12. Related documentation

- [Company onboarding](./company-onboarding-requirements.md)
- [Platform integrations guide](./platform-integrations-guide.md) (combined PDF)
