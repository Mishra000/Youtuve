import { useUser } from "@/lib/AuthContext";
import Videogrid from "@/components/Videogrid";
import { PlaySquare } from "lucide-react";

export default function SubscriptionsPage() {
  const { user, handlegooglesignin } = useUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PlaySquare className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">Don't miss new videos</h2>
        <p className="text-gray-600 mb-6 max-w-sm">
          Sign in to see updates from your favorite YouTube channels
        </p>
        <button
          onClick={handlegooglesignin}
          className="bg-blue-600 text-white font-medium px-5 py-2.5 rounded-full hover:bg-blue-700 transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <main className="flex-1 p-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-red-100 p-3 rounded-full text-red-600">
          <PlaySquare className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Latest Subscriptions</h1>
          <p className="text-sm text-gray-500">Recent videos from your subscribed channels</p>
        </div>
      </div>

      <Videogrid />
    </main>
  );
}
