import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { getVideoUrl } from "@/lib/axiosinstance";

export default function RelatedVideos({ videos }: { videos?: any[] }) {
  const safeList = Array.isArray(videos) ? videos : [];

  if (safeList.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base text-gray-900 mb-2">Related Videos</h3>
      {safeList.map((video) => {
        const videoSrc = getVideoUrl(video?.filepath);

        return (
          <Link
            key={video._id}
            href={`/watch/${video._id}`}
            className="flex gap-2 group block"
          >
            <div className="relative w-40 aspect-video bg-gray-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
              {videoSrc ? (
                <video
                  src={videoSrc}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  preload="metadata"
                />
              ) : (
                <div className="text-xs text-gray-400">Video</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs line-clamp-2 text-gray-900 group-hover:text-blue-600">
                {video.videotitle || "Untitled"}
              </h4>
              <p className="text-[11px] text-gray-500 mt-1">{video.videochanel || "Unknown"}</p>
              <p className="text-[11px] text-gray-500">
                {(video.views || 0).toLocaleString()} views
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
