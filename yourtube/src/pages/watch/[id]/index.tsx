import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import Head from "next/head";

const WatchPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [currentVideo, setCurrentVideo] = useState<any>(null);
  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      if (!id || typeof id !== "string") return;
      try {
        setLoading(true);
        const res = await axiosInstance.get("/video/getall");
        if (Array.isArray(res.data)) {
          const found = res.data.find((vid: any) => vid._id === id);
          setCurrentVideo(found || null);
          setAllVideos(res.data.filter((vid: any) => vid._id !== id));
        }
      } catch (error) {
        console.error("Error loading video details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchvideo();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Loading video...
        </div>
      </div>
    );
  }

  if (!currentVideo) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Video not found</h2>
        <p className="text-gray-500">The video you are looking for does not exist or was removed.</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{currentVideo.videotitle || "Watch"} – YourTube</title>
        <meta name="description" content={`Watch ${currentVideo.videotitle || "video"} on YourTube`} />
      </Head>
      <div className="min-h-screen bg-white">
        <div className={`mx-auto p-2 md:p-4 transition-all duration-300`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Custom video player — passes related videos for autoplay-next */}
              <Videopplayer video={currentVideo} relatedVideos={allVideos} />
              <VideoInfo video={currentVideo} />
              <Comments videoId={id} />
            </div>
            <div className="space-y-4">
              <RelatedVideos videos={allVideos} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default WatchPage;
