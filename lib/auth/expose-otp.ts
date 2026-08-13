/** True when OTP codes may be shown on-screen for local/testing (never in production unless forced). */
export function shouldExposeOtpCodes() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.SHOW_DEV_OTP === "true" ||
    process.env.NEXT_PUBLIC_SHOW_DEV_OTP === "true"
  );
}
