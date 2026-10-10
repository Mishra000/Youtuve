import React, { useEffect, useRef, useState } from "react";
import { X, Send, SmilePlus } from "lucide-react";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

const EMOJI_LIST = ["😀", "😂", "👍", "❤️", "🎉", "🔥", "👏", "😍", "🤔", "😮"];

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserName: string;
  chatEnabled: boolean;
  onSendMessage: (message: string) => void;
  onClose: () => void;
}

export default function ChatPanel({
  messages,
  currentUserId,
  currentUserName,
  chatEnabled,
  onSendMessage,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const msg = input.trim();
    if (!msg || !chatEnabled) return;
    onSendMessage(msg);
    setInput("");
    setShowEmoji(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-gray-900">Meeting Chat</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">
            No messages yet. Say hello! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              {!isMe && (
                <span className="text-xs text-gray-500 ml-1 mb-0.5">
                  {msg.senderName}
                </span>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? "bg-red-600 text-white rounded-br-none"
                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                }`}
              >
                {msg.message}
              </div>
              <span className="text-xs text-gray-400 mt-0.5 mx-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Chat disabled notice */}
      {!chatEnabled && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700 text-center">
          Chat has been disabled by the host.
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && chatEnabled && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-1.5">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setInput((prev) => prev + emoji)}
              className="text-xl hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t flex items-center gap-2">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          disabled={!chatEnabled}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-40"
          title="Emoji"
        >
          <SmilePlus className="w-4 h-4" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={chatEnabled ? "Send a message…" : "Chat disabled"}
          disabled={!chatEnabled}
          rows={1}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 max-h-24"
          style={{ lineHeight: "1.4" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || !chatEnabled}
          className="p-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white transition-colors"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
