import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";

const ChannelDetail = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isMyChannel = user && (user._id === id || user.id === id);
  const channelData = isMyChannel
    ? user
    : {
        _id: id,
        channelname: "Channel Videos",
        description: "Welcome to this channel!",
      };

  useEffect(() => {
    const fetchChannelVideos = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const res = await axiosInstance.get("/video/getall");
        if (Array.isArray(res.data)) {
          const filtered = res.data.filter(
            (vid: any) => vid.uploader === id || vid.videochanel === user?.channelname
          );
          setVideos(filtered.length > 0 ? filtered : res.data);
        }
      } catch (error) {
        console.error("Error fetching channel videos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchChannelVideos();
  }, [id, user]);

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channelData} user={user} />
        <Channeltabs />
        {isMyChannel && (
          <div className="px-4 py-6 border-b">
            <VideoUploader
              channelId={user?._id || user?.id || id}
              channelName={user?.channelname || "My Channel"}
            />
          </div>
        )}
        <div className="px-4 py-6">
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading videos...</p>
          ) : (
            <ChannelVideos videos={videos} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelDetail;
