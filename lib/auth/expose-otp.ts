/** True when OTP codes may be returned in API responses for local/testing. */
export function shouldExposeOtpCodes() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.SHOW_DEV_OTP === "true"
  );
}
