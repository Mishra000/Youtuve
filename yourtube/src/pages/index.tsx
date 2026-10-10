import CategoryTabs from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";
import { useState } from "react";

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState("All");

  return (
    <div className="flex-1 p-2 md:p-4">
      <CategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
      <Videogrid selectedCategory={selectedCategory} />
    </div>
  );
}
