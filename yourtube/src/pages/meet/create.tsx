import React, { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Video, Copy, Check, ArrowRight, LogIn } from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";

export default function MeetCreatePage() {
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<{
    roomId: string;
    link: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");

  const handleCreate = async () => {
    if (!user) {
      toast.error("Please sign in to create a meeting");
      return;
    }
    setLoading(true);
    try {
      const res = await axiosInstance.post("/meeting/create", {
        userId: user._id,
        userName: user.name || user.email,
      });
      const { meeting } = res.data;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setCreatedMeeting({
        roomId: meeting.roomId,
        link: `${origin}/meet/${meeting.roomId}`,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create meeting";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinRoomId.trim();
    if (!raw) return;

    let extractedId = raw;
    if (raw.includes("/meet/")) {
      const parts = raw.split("/meet/");
      extractedId = parts[parts.length - 1].split("?")[0].split("#")[0];
    } else if (raw.includes("/")) {
      const parts = raw.split("/");
      extractedId = parts[parts.length - 1].split("?")[0].split("#")[0];
    }
    extractedId = extractedId.trim().toUpperCase();

    if (!extractedId) {
      toast.error("Invalid room ID or link");
      return;
    }
    router.push(`/meet/${extractedId}`);
  };

  return (
    <>
      <Head>
        <title>Meet – YourTube</title>
        <meta name="description" content="Create or join a video meeting on YourTube" />
      </Head>

      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6">
          {/* Hero */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-2xl mb-4">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">YourTube Meet</h1>
            <p className="text-gray-500">
              Real-time video meetings — secure, free, and built right into YourTube.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Create Meeting Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Video className="w-5 h-5 text-red-600" />
                Create a meeting
              </h2>

              {!createdMeeting ? (
                <>
                  <p className="text-sm text-gray-500">
                    Generate a unique meeting link and invite others to join.
                  </p>
                  {user ? (
                    <button
                      onClick={handleCreate}
                      disabled={loading}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Video className="w-4 h-4" />
                      )}
                      {loading ? "Starting…" : "Start Meeting"}
                    </button>
                  ) : (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      Please{" "}
                      <button
                        className="underline font-semibold"
                        onClick={() => toast.info("Please sign in from the header")}
                      >
                        sign in
                      </button>{" "}
                      to create a meeting.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
                      Meeting created!
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                      Current Room ID
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-lg font-mono font-bold tracking-widest text-gray-800">
                        {createdMeeting.roomId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(createdMeeting.roomId)}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex items-center gap-1 text-xs font-medium"
                        title="Copy Room ID"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-600" />
                        )}
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                      Meeting Link
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        readOnly
                        value={createdMeeting.link}
                        className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-700 truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(createdMeeting.link)}
                        className="px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
                        title="Copy Link"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copied ? "Copied" : "Copy Link"}</span>
                      </button>
                    </div>
                  </div>

                  <Link
                    href={`/meet/${createdMeeting.roomId}`}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Join Meeting
                  </Link>
                </div>
              )}
            </div>

            {/* Join Meeting Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <LogIn className="w-5 h-5 text-blue-600" />
                Join a meeting
              </h2>
              <p className="text-sm text-gray-500">
                Enter a room ID or paste a meeting link to join.
              </p>
              <form onSubmit={handleJoin} className="space-y-3">
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Enter room ID or paste meeting link"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-wide placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
                />
                <button
                  type="submit"
                  disabled={!joinRoomId.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Join Meeting
                </button>
              </form>
            </div>
          </div>

          {/* Info strip */}
          <div className="text-center text-xs text-gray-400 space-y-1">
            <p>🔒 Meetings use WebRTC end-to-end encrypted media transport.</p>
            <p>No video or audio is stored on our servers.</p>
          </div>
        </div>
      </div>
    </>
  );
}

// Disable the default layout's Header+Sidebar for this page — we want a full page
MeetCreatePage.getLayout = undefined;
