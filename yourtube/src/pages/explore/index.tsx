import CategoryTabs from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";
import { Compass } from "lucide-react";
import { useState } from "react";

export default function ExplorePage() {
  const [selectedCategory, setSelectedCategory] = useState("Trending");

  return (
    <main className="flex-1 p-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-red-100 p-3 rounded-full text-red-600">
          <Compass className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Explore Trending Videos</h1>
          <p className="text-sm text-gray-500">Discover popular content across YouTube</p>
        </div>
      </div>

      <CategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
      <Videogrid selectedCategory={selectedCategory === "Trending" ? "All" : selectedCategory} />
    </main>
  );
}
