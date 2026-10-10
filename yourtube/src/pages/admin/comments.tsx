/**
 * /admin/comments — Admin Comment Moderation Dashboard
 * Only accessible to users with role === "admin"
 * Features:
 *  - View reported comments with original text, user details, location, and language
 *  - Filter by report status: PENDING, REVIEWED, ACTION_TAKEN, DISMISSED, ALL
 *  - Actions: Dismiss, Remove/Soft-delete, Restore, Mark Reviewed
 *  - View edit history of reported comments
 *  - View full moderation audit logs with timestamps and moderator IDs
 */
import React, { useEffect, useState } from "react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { formatDistanceToNow } from "date-fns";
import Head from "next/head";
import { Button } from "@/components/ui/button";

type ModerationStatus = "PENDING" | "REVIEWED" | "ACTION_TAKEN" | "DISMISSED" | "ALL";

interface Report {
  _id: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
  reportedBy?: { name: string; email: string };
  commentId?: {
    _id: string;
    commentbody: string;
    originalText?: string;
    originalLanguage?: string;
    usercommented: string;
    moderationStatus: string;
    reportCount: number;
    deleted: boolean;
    isDeleted?: boolean;
    createdAt?: string;
    userid?: { name: string; email: string; location?: string; city?: string; state?: string };
  };
}

interface ModLog {
  _id: string;
  commentId: string;
  action: string;
  reason: string;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
  adminId?: { name: string; email: string };
}

export default function AdminComments() {
  const { user } = useUser() as any;
  const [activeTab, setActiveTab] = useState<"reports" | "logs">("reports");

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ModerationStatus>("PENDING");

  // Moderation action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionTarget, setActionTarget] = useState<string | null>(null);

  // History modal state
  const [selectedCommentHistory, setSelectedCommentHistory] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const isAdmin = user?.role === "admin";

  const loadReports = async (pg = 1, st = status) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        `/comment/admin/reports?userId=${user?._id}&status=${st}&page=${pg}`
      );
      setReports(res.data.reports || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      setPage(pg);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axiosInstance.get(`/comment/admin/logs?userId=${user?._id}`);
      setLogs(res.data.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id && isAdmin) {
      if (activeTab === "reports") {
        loadReports(1, status);
      } else {
        loadLogs();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, activeTab]);

  const handleAction = async (reportId: string, action: "DISMISS" | "ACTION_TAKEN" | "REVIEWED") => {
    setActionLoading(reportId + action);
    try {
      await axiosInstance.put(`/comment/admin/reports/${reportId}`, {
        action,
        adminId: user._id,
        note,
      });
      await loadReports(page, status);
      setActionTarget(null);
      setNote("");
    } catch (e: any) {
      alert(e?.response?.data?.message || "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (commentId: string) => {
    if (!window.confirm("Restore this comment to visible status?")) return;
    try {
      await axiosInstance.put(`/comment/admin/${commentId}/restore`, {
        adminId: user._id,
        note: "Admin restored",
      });
      await loadReports(page, status);
      alert("Comment restored successfully.");
    } catch (e: any) {
      alert(e?.response?.data?.message || "Restore failed.");
    }
  };

  const viewHistory = async (commentId: string) => {
    setHistoryLoading(true);
    setSelectedCommentHistory(null);
    try {
      const res = await axiosInstance.get(`/comment/${commentId}/history?userId=${user?._id}`);
      setSelectedCommentHistory(res.data.editHistory || []);
    } catch {
      setSelectedCommentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!user) {
    return <div className="p-8 text-center text-gray-500">Please sign in with administrator credentials.</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-red-500 mb-2">Access Denied</h2>
        <p className="text-gray-500 text-sm">You do not have administrator permissions to access comment moderation.</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Comment Moderation & Security – Admin</title>
      </Head>

      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>🛡️</span>
              <span>Comment Moderation Dashboard</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Review flagged comments, spam reports, and maintain community safety
            </p>
          </div>

          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("reports")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "reports"
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xs"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              Reports ({total})
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "logs"
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xs"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              Audit Logs
            </button>
          </div>
        </div>

        {activeTab === "reports" ? (
          <>
            {/* Filter buttons */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-400 font-medium mr-1">Status:</span>
              {(["PENDING", "REVIEWED", "ACTION_TAKEN", "DISMISSED", "ALL"] as ModerationStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    status === s
                      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-xs"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-16 text-gray-400">Loading reports…</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-16 text-gray-400 italic bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                No reports found matching this criteria.
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => {
                  const c = report.commentId;
                  const isDel = Boolean(c?.deleted || c?.isDeleted);

                  return (
                    <div
                      key={report._id}
                      className="border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3.5 bg-white dark:bg-gray-900 shadow-xs"
                    >
                      {/* Comment Info Header */}
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                            {c?.usercommented?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                {c?.usercommented || "Unknown Author"}
                              </span>
                              {c?.userid?.location && (
                                <span className="text-[11px] text-gray-400">📍 {c.userid.location}</span>
                              )}
                              {c?.originalLanguage && (
                                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 font-mono">
                                  {c.originalLanguage.toUpperCase()}
                                </span>
                              )}
                            </div>
                            {c?.userid?.email && (
                              <p className="text-xs text-gray-400">{c.userid.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                              c?.moderationStatus === "ACTION_TAKEN"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : c?.moderationStatus === "FLAGGED"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            Status: {c?.moderationStatus || "OK"}
                          </span>

                          {c?._id && (
                            <button
                              onClick={() => viewHistory(c._id)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              History
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Comment Body */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 text-sm">
                        <div className="text-xs text-gray-400 mb-1 font-semibold">Comment Content:</div>
                        <p className={isDel ? "text-gray-400 italic" : "text-gray-800 dark:text-gray-200"}>
                          {c?.commentbody || "[No content]"}
                        </p>
                        {c?.originalText && c.originalText !== c.commentbody && (
                          <div className="mt-2 text-xs text-gray-400 border-t pt-1">
                            <span>Original submitted text: </span>
                            <span className="italic">{c.originalText}</span>
                          </div>
                        )}
                      </div>

                      {/* Report Reason & Reporter Info */}
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400 bg-red-50/50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-900/40">
                        <div>
                          <strong className="text-red-700 dark:text-red-400">Reason: {report.reason}</strong>
                          {report.description && <span className="ml-2 italic">— &quot;{report.description}&quot;</span>}
                        </div>
                        <div>
                          <span>Reported by: <strong>{report.reportedBy?.name || "User"}</strong></span>
                          <span className="mx-1.5">·</span>
                          <span>{formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                        {report.status === "PENDING" ? (
                          actionTarget === report._id ? (
                            <div className="flex items-center gap-2 flex-1 flex-wrap">
                              <input
                                type="text"
                                placeholder="Audit note (optional)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="flex-1 border rounded-lg px-2.5 py-1 text-xs focus:outline-none dark:bg-gray-800 dark:text-gray-100"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleAction(report._id, "ACTION_TAKEN")}
                                disabled={Boolean(actionLoading)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                              >
                                Remove Comment
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction(report._id, "REVIEWED")}
                                disabled={Boolean(actionLoading)}
                                className="text-xs h-8"
                              >
                                Mark Reviewed
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAction(report._id, "DISMISS")}
                                disabled={Boolean(actionLoading)}
                                className="text-xs h-8"
                              >
                                Dismiss
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActionTarget(null)}
                                className="text-xs h-8 text-gray-400"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setActionTarget(report._id)}
                              className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold h-8"
                            >
                              Take Action
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-gray-400">
                            Report Status: <strong>{report.status}</strong>
                          </span>
                        )}

                        {isDel && c?._id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(c._id)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 border-emerald-300 h-8"
                          >
                            Restore Comment
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center gap-1.5 pt-4">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => loadReports(p, status)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      p === page
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-xs"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Audit Logs Tab */
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Moderation Audit Trail</h2>
            {logsLoading ? (
              <div className="text-center py-16 text-gray-400">Loading audit logs…</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-gray-400 italic">No moderation actions recorded yet.</div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-500 font-semibold">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Moderator</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Reason / Note</th>
                      <th className="p-3">Status Transition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="p-3 text-gray-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200">
                          {log.adminId?.name || "Admin"}
                        </td>
                        <td className="p-3">
                          <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-semibold">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          {log.reason || "—"}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-gray-500">
                          {log.previousStatus || "N/A"} → {log.newStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* History Modal for Selected Comment */}
        {selectedCommentHistory !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setSelectedCommentHistory(null)}
          >
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-200 dark:border-gray-800 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Comment Edit History</h3>
                <button
                  onClick={() => setSelectedCommentHistory(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ×
                </button>
              </div>

              {historyLoading ? (
                <div className="text-center py-8 text-sm text-gray-500">Loading…</div>
              ) : selectedCommentHistory.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400 italic">No revision history found.</div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {selectedCommentHistory.map((rev, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Revision #{selectedCommentHistory.length - idx}</span>
                        <span>{rev.editedAt ? new Date(rev.editedAt).toLocaleString() : "Date unknown"}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                        {rev.previousText || rev.text || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="ghost" onClick={() => setSelectedCommentHistory(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
