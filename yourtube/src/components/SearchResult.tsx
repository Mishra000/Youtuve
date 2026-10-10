import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import axiosInstance, { getVideoUrl } from "@/lib/axiosinstance";
import { Play } from "lucide-react";

const SearchResult = ({ query }: { query: string }) => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query || !query.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await axiosInstance.get("/video/getall");
        if (Array.isArray(res.data)) {
          const qLower = query.toLowerCase().trim();
          const filtered = res.data.filter(
            (vid: any) =>
              (vid.videotitle || "").toLowerCase().includes(qLower) ||
              (vid.videochanel || "").toLowerCase().includes(qLower)
          );
          setResults(filtered);
        }
      } catch (error) {
        console.error("Error performing search:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  if (!query || !query.trim()) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">
          Enter a search term to find videos and channels.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Searching videos...</div>;
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">No results found for "{query}"</h2>
        <p className="text-gray-600">
          Try different keywords or check your spelling
        </p>
      </div>
    );
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 font-medium">
        Showing {results.length} result{results.length > 1 ? "s" : ""} for "{query}"
      </p>

      <div className="space-y-4">
        {results.map((video: any) => {
          const videoSrc = getVideoUrl(video?.filepath);
          const channelName = video.videochanel || "Unknown Channel";

          return (
            <div key={video._id} className="flex flex-col sm:flex-row gap-4 group">
              <Link href={`/watch/${video._id}`} className="flex-shrink-0">
                <div className="relative w-full sm:w-80 aspect-video bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
                  {videoSrc ? (
                    <video
                      src={videoSrc}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      preload="metadata"
                    />
                  ) : (
                    <Play className="w-10 h-10 text-gray-400" />
                  )}
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1 rounded">
                    10:24
                  </div>
                </div>
              </Link>

              <div className="flex-1 min-w-0 py-1">
                <Link href={`/watch/${video._id}`}>
                  <h3 className="font-semibold text-lg line-clamp-2 text-gray-900 group-hover:text-blue-600 mb-1">
                    {video.videotitle}
                  </h3>
                </Link>

                <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                  <span>{(video.views || 0).toLocaleString()} views</span>
                  <span>•</span>
                  <span>
                    {video.createdAt
                      ? (() => {
                          try {
                            return formatDistanceToNow(new Date(video.createdAt)) + " ago";
                          } catch (e) {
                            return "Recently";
                          }
                        })()
                      : "Recently"}
                  </span>
                </div>

                <Link
                  href={`/channel/${video.uploader || "default"}`}
                  className="flex items-center gap-2 mb-2 hover:text-blue-600"
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-red-600 text-white font-bold">
                      {channelName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-gray-700">
                    {channelName}
                  </span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SearchResult;
