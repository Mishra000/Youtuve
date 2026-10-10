import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useState } from "react";
import { Play } from "lucide-react";
import { getVideoUrl } from "@/lib/axiosinstance";

export default function VideoCard({ video }: { video: any }) {
  const [videoError, setVideoError] = useState(false);
  const videoSrc = getVideoUrl(video?.filepath);

  const formattedDate = video?.createdAt
    ? (() => {
        try {
          return formatDistanceToNow(new Date(video.createdAt)) + " ago";
        } catch (e) {
          return "Recently";
        }
      })()
    : "Recently";

  const channelName = video?.videochanel || "Unknown Channel";
  const title = video?.videotitle || "Untitled Video";
  const views = typeof video?.views === "number" ? video.views.toLocaleString() : "0";

  return (
    <Link href={`/watch/${video?._id}`} className="group block">
      <div className="space-y-3">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center">
          {!videoError && videoSrc ? (
            <video
              src={videoSrc}
              muted
              playsInline
              onError={() => setVideoError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              preload="metadata"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 p-4 text-center">
              <Play className="w-10 h-10 mb-1 opacity-60" />
              <span className="text-xs font-medium">{title}</span>
            </div>
          )}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            {video?.duration || "3:45"}
          </div>
        </div>

        <div className="flex gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback className="bg-red-600 text-white font-bold text-xs">
              {channelName[0]?.toUpperCase() || "Y"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm line-clamp-2 text-foreground group-hover:text-blue-600 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 hover:text-foreground">
              {channelName}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {views} views • {formattedDate}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
