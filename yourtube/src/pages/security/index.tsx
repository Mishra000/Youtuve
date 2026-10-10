/**
 * /security — Account Security, Login History & Trusted Devices Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Allows authenticated users to:
 *  - Review their Login History (IP, Browser, OS, Device, Location, Status, Time in IST)
 *  - View and manage Trusted Devices / Sessions (with Current Device badge and Revoke button)
 *  - View Security Audit Events
 *  - Review and customize their Adaptive Theme setting (05:00-12:00 IST Light / 12:00-05:00 IST Dark)
 */

import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldCheck,
  Laptop,
  Smartphone,
  MapPin,
  Clock,
  History,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface LoginAttemptItem {
  _id: string;
  ipAddress: string;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType: string;
  deviceModel: string;
  city: string;
  state: string;
  country: string;
  status: string;
  loginAtIST: string;
  otpVerifiedAtIST?: string;
}

interface TrustedDeviceItem {
  _id: string;
  deviceIdentifier: string;
  deviceName: string;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType: string;
  ipAddress: string;
  city: string;
  state: string;
  country: string;
  trustedAtIST: string;
  expiresAtIST: string;
  lastUsedAtIST: string;
  isCurrent: boolean;
}

interface SecurityEventItem {
  _id: string;
  eventType: string;
  description: string;
  ipAddress: string;
  browser: string;
  os: string;
  location: string;
  timestampIST: string;
}

export default function SecurityPage() {
  const { user, handlegooglesignin } = useUser() as any;
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"devices" | "history" | "events" | "theme">("devices");

  // Trusted Devices State
  const [devices, setDevices] = useState<TrustedDeviceItem[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Login History State
  const [history, setHistory] = useState<LoginAttemptItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Security Events State
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Theme Preference State
  const [userThemePref, setUserThemePref] = useState<string>(user?.themePreference || "auto");
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeSaveSuccess, setThemeSaveSuccess] = useState(false);

  // Fetch Trusted Devices
  const fetchDevices = async () => {
    if (!user?._id) return;
    setDevicesLoading(true);
    try {
      const res = await axiosInstance.get(`/auth/security/trusted-devices`);
      setDevices(res.data.devices || []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  // Fetch Login History
  const fetchHistory = async (page = 1) => {
    if (!user?._id) return;
    setHistoryLoading(true);
    try {
      const res = await axiosInstance.get(`/auth/security/login-history?page=${page}&limit=8`);
      setHistory(res.data.attempts || []);
      setHistoryTotal(res.data.total || 0);
      setHistoryPages(res.data.pages || 1);
      setHistoryPage(page);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch Security Events
  const fetchEvents = async () => {
    if (!user?._id) return;
    setEventsLoading(true);
    try {
      const res = await axiosInstance.get(`/auth/security/events`);
      setEvents(res.data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) {
      setUserThemePref(user.themePreference || "auto");
      fetchDevices();
      fetchHistory(1);
      fetchEvents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // Revoke Device
  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.confirm("Are you sure you want to revoke this trusted device? It will require OTP verification on its next login.")) return;
    setRevokingId(deviceId);
    try {
      const res = await axiosInstance.post(`/auth/security/trusted-device/revoke`, { deviceId });
      if (res.data.success) {
        setDevices((prev) => prev.filter((d) => d._id !== deviceId));
        fetchEvents();
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to revoke device.");
    } finally {
      setRevokingId(null);
    }
  };

  // Update Theme Preference
  const handleSaveThemePreference = async (pref: "light" | "dark" | "auto") => {
    setUserThemePref(pref);
    setSavingTheme(true);
    setThemeSaveSuccess(false);

    try {
      if (pref !== "auto") {
        setTheme(pref);
      }
      await axiosInstance.patch(`/auth/update/${user._id}`, {
        themePreference: pref,
      });
      setThemeSaveSuccess(true);
      setTimeout(() => setThemeSaveSuccess(false), 3000);
    } catch (err) {
      console.warn("Error saving theme preference:", err);
    } finally {
      setSavingTheme(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold">Account Security</h1>
        <p className="text-sm text-gray-500">
          Please sign in to view your login history, trusted devices, and security settings.
        </p>
        <Button onClick={handlegooglesignin} className="bg-red-600 hover:bg-red-700 text-white">
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Account Security &amp; Trusted Devices – YourTube</title>
      </Head>

      <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
        {/* Header Banner */}
        <div className="border border-border rounded-2xl p-6 bg-card text-card-foreground shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Account Security &amp; Devices</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage trusted devices, inspect suspicious sign-in alerts, and configure adaptive themes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Login OTP Protection Active</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("devices")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "devices"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Trusted Devices ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "history"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Login History ({historyTotal})</span>
          </button>

          <button
            onClick={() => setActiveTab("events")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "events"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Security Events ({events.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("theme")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === "theme"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Adaptive Theme Settings</span>
          </button>
        </div>

        {/* TAB 1: Trusted Devices */}
        {activeTab === "devices" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Authorized &amp; Trusted Devices</h2>
                <p className="text-xs text-muted-foreground">
                  These devices and browsers bypass OTP verification for 30 days unless revoked.
                </p>
              </div>
            </div>

            {devicesLoading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Loading trusted devices…</div>
            ) : devices.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-2xl text-xs text-muted-foreground space-y-2">
                <Laptop className="w-8 h-8 mx-auto text-gray-400" />
                <p>No trusted devices recorded yet. Log in to establish your first trusted environment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((dev) => (
                  <div
                    key={dev._id}
                    className="border border-border rounded-2xl p-4 bg-card text-card-foreground shadow-xs space-y-3 relative group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300">
                          {dev.deviceType === "Mobile" ? (
                            <Smartphone className="w-5 h-5" />
                          ) : (
                            <Laptop className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{dev.deviceName}</span>
                            {dev.isCurrent && (
                              <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                Current Device
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {dev.browserName} {dev.browserVersion} • {dev.operatingSystem}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeDevice(dev._id)}
                        disabled={revokingId === dev._id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs h-8"
                        title="Revoke access"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {revokingId === dev._id ? "Revoking…" : "Revoke"}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50 dark:bg-gray-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                      <div>
                        <span className="text-muted-foreground">Location: </span>
                        <span className="font-medium text-foreground">
                          {dev.city && dev.city !== "Unknown" ? `${dev.city}, ${dev.state}` : "Approximate / Local"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IP Address: </span>
                        <span className="font-mono text-foreground">{dev.ipAddress}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Trusted Since: </span>
                        <span className="text-foreground">{dev.trustedAtIST}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expires At: </span>
                        <span className="text-foreground">{dev.expiresAtIST}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Login History */}
        {activeTab === "history" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold">Login History</h2>
              <p className="text-xs text-muted-foreground">
                All recorded sign-in attempts with browser, IP, location, and status.
              </p>
            </div>

            {historyLoading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Loading login history…</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">No login attempts recorded yet.</div>
            ) : (
              <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="p-3">Time (IST)</th>
                        <th className="p-3">Device / Browser</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Location</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.map((row) => (
                        <tr key={row._id} className="hover:bg-accent/50 transition-colors">
                          <td className="p-3 font-medium text-foreground whitespace-nowrap">
                            {row.loginAtIST}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-foreground">
                              {row.browserName} {row.browserVersion}
                            </div>
                            <div className="text-muted-foreground text-[11px]">
                              {row.operatingSystem} ({row.deviceType})
                            </div>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {row.ipAddress}
                          </td>
                          <td className="p-3 text-foreground">
                            {row.city && row.city !== "Unknown" ? (
                              <span>{row.city}, {row.state}</span>
                            ) : (
                              <span className="text-muted-foreground italic">Unknown</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                row.status === "SUCCESS"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                  : row.status === "OTP_VERIFIED"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  : row.status === "OTP_REQUIRED"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {historyPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-border text-xs text-muted-foreground">
                    <span>
                      Page {historyPage} of {historyPages} ({historyTotal} attempts)
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchHistory(historyPage - 1)}
                        disabled={historyPage <= 1}
                        className="h-7 text-xs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchHistory(historyPage + 1)}
                        disabled={historyPage >= historyPages}
                        className="h-7 text-xs"
                      >
                        Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Security Events */}
        {activeTab === "events" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold">Security Audit Log</h2>
              <p className="text-xs text-muted-foreground">
                Tamper-evident log of logins, OTP verifications, and device trust modifications.
              </p>
            </div>

            {eventsLoading ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Loading audit log…</div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">No security events recorded yet.</div>
            ) : (
              <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="p-3">Time (IST)</th>
                      <th className="p-3">Event Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Client Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((ev) => (
                      <tr key={ev._id} className="hover:bg-accent/50 transition-colors">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{ev.timestampIST}</td>
                        <td className="p-3">
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px] font-semibold text-foreground">
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="p-3 text-foreground font-medium">{ev.description}</td>
                        <td className="p-3 text-muted-foreground">
                          {ev.browser} • {ev.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Adaptive Theme Settings */}
        {activeTab === "theme" && (
          <div className="space-y-5 animate-in fade-in duration-150 max-w-2xl">
            <div>
              <h2 className="text-base font-bold">Adaptive Theme &amp; Timezone Rule</h2>
              <p className="text-xs text-muted-foreground">
                Automatic theme selection adheres to IST (Asia/Kolkata timezone) upon sign-in.
              </p>
            </div>

            {/* Explanation card */}
            <div className="border border-border rounded-2xl p-5 bg-card space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>IST Automatic Rule Specification:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5">
                  <Sun className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-900 dark:text-amber-200">5:00 AM — 12:00 PM IST</strong>
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">Light Theme automatically selected upon sign-in.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 flex items-start gap-2.5">
                  <Moon className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-indigo-900 dark:text-indigo-200">12:00 PM — 5:00 AM IST</strong>
                    <p className="text-indigo-700 dark:text-indigo-400 mt-0.5">Dark Theme automatically selected upon sign-in.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* User Custom Override Selection */}
            <div className="border border-border rounded-2xl p-5 bg-card space-y-4">
              <h3 className="text-sm font-bold">Your Theme Preference:</h3>
              <p className="text-xs text-muted-foreground">
                Manual preferences persist across devices and take priority over automatic login time selection.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleSaveThemePreference("auto")}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                    userThemePref === "auto"
                      ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 ring-2 ring-red-500/20"
                      : "border-border hover:bg-accent text-foreground"
                  }`}
                >
                  <Sparkles className="w-5 h-5 mx-auto mb-1.5" />
                  <span>Automatic (IST)</span>
                </button>

                <button
                  onClick={() => handleSaveThemePreference("light")}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                    userThemePref === "light"
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20"
                      : "border-border hover:bg-accent text-foreground"
                  }`}
                >
                  <Sun className="w-5 h-5 mx-auto mb-1.5" />
                  <span>Always Light</span>
                </button>

                <button
                  onClick={() => handleSaveThemePreference("dark")}
                  className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                    userThemePref === "dark"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20"
                      : "border-border hover:bg-accent text-foreground"
                  }`}
                >
                  <Moon className="w-5 h-5 mx-auto mb-1.5" />
                  <span>Always Dark</span>
                </button>
              </div>

              {themeSaveSuccess && (
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Theme preference saved to your profile!</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
