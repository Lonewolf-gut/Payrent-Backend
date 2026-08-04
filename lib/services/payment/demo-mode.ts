export function isPaymentDemoMode() {
  const value = process.env.PAYMENT_DEMO_MODE?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
