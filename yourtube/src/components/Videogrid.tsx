import React, { useEffect, useState } from "react";
import Videocard from "./videocard";
import axiosInstance from "@/lib/axiosinstance";

interface Video {
  _id: string;
  videotitle?: string;
  filename?: string;
  filetype?: string;
  filepath?: string;
  filesize?: string;
  videochanel?: string;
  Like?: number;
  views?: number;
  uploader?: string;
  createdAt?: string;
}

interface VideogridProps {
  selectedCategory?: string;
}

const Videogrid = ({ selectedCategory = "All" }: VideogridProps) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get("/video/getall");

        if (Array.isArray(res.data)) {
          setVideos(res.data);
        } else if (Array.isArray(res.data?.videos)) {
          setVideos(res.data.videos);
        } else {
          setVideos([]);
        }
      } catch (err) {
        console.error("Error fetching videos:", err);
        setError("Failed to load videos from server.");
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  const filteredVideos = (videos || []).filter((video) => {
    if (!selectedCategory || selectedCategory === "All") return true;
    const catLower = selectedCategory.toLowerCase();
    const titleLower = (video.videotitle || "").toLowerCase();
    const channelLower = (video.videochanel || "").toLowerCase();
    return titleLower.includes(catLower) || channelLower.includes(catLower);
  });

  return (
    <div className="w-full">
      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="animate-pulse space-y-3">
              <div className="aspect-video bg-gray-200 rounded-xl" />
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-red-500 font-medium mb-2">{error}</p>
          <p className="text-sm text-gray-500">
            Make sure the backend server is running on port 5000.
          </p>
        </div>
      )}

      {/* Video Cards Grid */}
      {!loading && !error && filteredVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredVideos.map((video) => (
            <Videocard key={video._id} video={video} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredVideos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-gray-50 my-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-1">
            {selectedCategory === "All"
              ? "No videos found"
              : `No videos found for "${selectedCategory}"`}
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Upload your first video to see it displayed here!
          </p>
        </div>
      )}
    </div>
  );
};

export default Videogrid;