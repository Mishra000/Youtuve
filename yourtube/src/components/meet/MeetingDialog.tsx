import React, { useState } from "react";
import { useRouter } from "next/router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Video, Copy, Check, ArrowRight, LogIn, Sparkles, Link as LinkIcon } from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";

interface MeetingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MeetingDialog({ isOpen, onClose }: MeetingDialogProps) {
  const { user, handlegooglesignin } = useUser();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [loading, setLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<{
    roomId: string;
    link: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [joinInput, setJoinInput] = useState("");

  const handleStartMeeting = async () => {
    if (!user) {
      toast.error("Please sign in to start a meeting");
      handlegooglesignin();
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
      const link = `${origin}/meet/${meeting.roomId}`;

      setCreatedMeeting({
        roomId: meeting.roomId,
        link,
      });
      toast.success("Meeting room created!");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create meeting";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "link" | "id") => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      }
      toast.success(type === "link" ? "Meeting link copied!" : "Room ID copied!");
    });
  };

  const handleJoinMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) return;

    // Handle full URL or room ID
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

    onClose();
    router.push(`/meet/${extractedId}`);
  };

  const handleJoinCreated = () => {
    if (!createdMeeting) return;
    onClose();
    router.push(`/meet/${createdMeeting.roomId}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white border border-gray-200 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-sm">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                YourTube Meet
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Real-time, encrypted video calls with screen sharing & chat
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-gray-100 p-1 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "create"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Video className="w-4 h-4 text-red-600" />
            Start Video Call
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("join")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "join"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <LogIn className="w-4 h-4 text-blue-600" />
            Join Meeting
          </button>
        </div>

        {/* Create Meeting View */}
        {activeTab === "create" && (
          <div className="space-y-4 pt-3">
            {!createdMeeting ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-red-50/60 border border-red-100 text-sm text-gray-700 space-y-1">
                  <div className="font-semibold text-red-700 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Instant Video Call
                  </div>
                  <p className="text-xs text-gray-600">
                    Click below to generate a unique meeting room and invite participants with a shareable link.
                  </p>
                </div>

                {user ? (
                  <Button
                    onClick={handleStartMeeting}
                    disabled={loading}
                    className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Generating Room...
                      </>
                    ) : (
                      <>
                        <Video className="w-4 h-4" />
                        Start Meeting
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      Please sign in to start a meeting and generate your room link.
                    </p>
                    <Button
                      onClick={handlegooglesignin}
                      className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      Sign In to Continue
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-800 text-sm font-medium">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Meeting Room is Ready!
                </div>

                {/* Current Room ID */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Current Room ID
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-base font-mono font-bold tracking-widest text-gray-900 select-all">
                      {createdMeeting.roomId}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(createdMeeting.roomId, "id")}
                      className="h-10 px-3 flex items-center gap-1.5 font-medium"
                      title="Copy Room ID"
                    >
                      {copiedId ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-gray-600" />
                          <span className="text-xs">Copy ID</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Meeting Link */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Meeting Link
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={createdMeeting.link}
                      className="flex-1 font-mono text-xs bg-gray-50 text-gray-700 h-10 select-all"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => copyToClipboard(createdMeeting.link, "link")}
                      className="h-10 px-3 bg-gray-900 hover:bg-gray-800 text-white font-medium flex items-center gap-1.5"
                      title="Copy Meeting Link"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span className="text-xs">Copy Link</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Join Meeting Action */}
                <Button
                  onClick={handleJoinCreated}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  Join Meeting
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Join Meeting View */}
        {activeTab === "join" && (
          <form onSubmit={handleJoinMeeting} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Room ID or Meeting Link
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="Paste meeting link or room ID (e.g. 7K9LP0QZ2B)"
                  className="h-11 px-3 text-sm font-mono placeholder:font-sans placeholder:text-gray-400 focus-visible:ring-red-500"
                  autoFocus
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={!joinInput.trim()}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              Join Meeting
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
