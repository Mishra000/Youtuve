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

  // Make sure id is always a string
  const channelId = typeof id === "string" ? id : "";

  // Check whether this is the logged-in user's channel
  const isMyChannel =
    !!user &&
    !!channelId &&
    (user._id === channelId || user.id === channelId);

  /*
   * Always provide a valid channel object.
   * This prevents:
   * Cannot read properties of null (reading 'channelname')
   */
  const channelData =
    isMyChannel && user
      ? user
      : {
          _id: channelId,
          channelname: "Channel Videos",
          description: "Welcome to this channel!",
        };

  // Fetch videos
  useEffect(() => {
    const fetchChannelVideos = async () => {
      if (!channelId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const res = await axiosInstance.get("/video/getall");

        if (Array.isArray(res.data)) {
          const filteredVideos = res.data.filter(
            (video: any) =>
              video.uploader === channelId ||
              (user?.channelname &&
                video.videochanel === user.channelname)
          );

          /*
           * If matching videos are found,
           * show only those videos.
           *
           * Otherwise show all videos.
           */
          setVideos(
            filteredVideos.length > 0 ? filteredVideos : res.data
          );
        } else {
          setVideos([]);
        }
      } catch (error) {
        console.error("Error fetching channel videos:", error);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchChannelVideos();
  }, [channelId, user]);

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">

        {/* Channel Header */}
        <ChannelHeader
          channel={channelData}
          user={user}
        />

        {/* Channel Tabs */}
        <Channeltabs />

        {/* Video Upload Section */}
        {isMyChannel && user && (
          <div className="px-4 py-6 border-b">
            <VideoUploader
              channelId={
                user._id ||
                user.id ||
                channelId
              }
              channelName={
                user.channelname ||
                "My Channel"
              }
            />
          </div>
        )}

        {/* Channel Videos */}
        <div className="px-4 py-6">
          {loading ? (
            <p className="text-gray-500 text-center py-8">
              Loading videos...
            </p>
          ) : videos.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No videos found
            </p>
          ) : (
            <ChannelVideos videos={videos} />
          )}
        </div>

      </div>
    </div>
  );
};

export default ChannelDetail;