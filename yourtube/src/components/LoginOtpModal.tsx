/**
 * LoginOtpModal.tsx — Login Security Verification & Trusted Device Dialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Displayed when backend detects a new/untrusted browser, device, IP, or location.
 * Allows user to verify 6-digit OTP code and optionally mark the device as trusted.
 */

import React, { useState, useEffect } from "react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "./ui/button";
import { ShieldCheck, Laptop, MapPin, AlertCircle, RefreshCw } from "lucide-react";

export default function LoginOtpModal() {
  const { pendingOtp, verifyLoginOtp, resendLoginOtp, cancelOtpLogin } = useUser() as any;

  const [otp, setOtp] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(45);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (!pendingOtp) {
      setOtp("");
      setError("");
      setResendMessage("");
      return;
    }

    setResendCooldown(45);
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingOtp]);

  if (!pendingOtp) return null;

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otp.trim() || otp.trim().length < 6 || loading) return;

    setLoading(true);
    setError("");
    setResendMessage("");

    const res = await verifyLoginOtp({
      tempToken: pendingOtp.tempToken,
      otp: otp.trim(),
      trustDevice,
    });

    if (!res.success) {
      setError(res.message);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError("");
    setResendMessage("");

    const res = await resendLoginOtp(pendingOtp.tempToken);
    setResending(false);

    if (res.success) {
      setResendMessage("A new verification code has been sent!");
      setResendCooldown(45);
      setTimeout(() => setResendMessage(""), 5000);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 sm:p-7 w-full max-w-md border border-gray-200 dark:border-gray-800 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon & Title */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Verify Your Login
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            We detected a sign-in attempt from a new browser, device, or location.
          </p>
        </div>

        {/* Detected Environment Info Card */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3.5 border border-gray-100 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>
              <strong>Device:</strong> {pendingOtp.browser || "Browser"} on {pendingOtp.os || "OS"} ({pendingOtp.deviceType || "Desktop"})
            </span>
          </div>
          {pendingOtp.location && pendingOtp.location !== "Unknown, Unknown" && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>
                <strong>Location:</strong> {pendingOtp.location}
              </span>
            </div>
          )}
          <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
            Code sent to: <span className="font-semibold text-gray-700 dark:text-gray-200">{pendingOtp.maskedEmail}</span>
          </div>
        </div>

        {/* Form: OTP Input & Trust Device */}
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Enter 6-Digit Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="123456"
              className="w-full text-center text-2xl font-mono tracking-widest py-2.5 px-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              autoFocus
            />
          </div>

          {/* Trust this device checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-gray-700 dark:text-gray-300 select-none">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="accent-red-600 w-4 h-4 rounded cursor-pointer"
            />
            <span>Trust this browser / device for 30 days (skip code on next login)</span>
          </label>

          {/* Error & Info Messages */}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resendMessage && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
              {resendMessage}
            </p>
          )}

          {/* Submit & Cancel Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              type="submit"
              disabled={otp.length < 6 || loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl shadow-xs"
            >
              {loading ? "Verifying…" : "Verify & Complete Login"}
            </Button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending}
                className="text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 disabled:no-underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>

              <button
                type="button"
                onClick={cancelOtpLogin}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Cancel login
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
