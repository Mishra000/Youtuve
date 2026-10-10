"use client";

import { Button } from "@/components/ui/button";

const categories = [
  "All",
  "Music",
  "Gaming",
  "Movies",
  "News",
  "Sports",
  "Technology",
  "Comedy",
  "Education",
  "Science",
  "Travel",
  "Food",
  "Fashion",
];

interface CategoryTabsProps {
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
}

export default function CategoryTabs({
  selectedCategory = "All",
  onSelectCategory,
}: CategoryTabsProps) {
  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
      {categories.map((category) => {
        const isActive = selectedCategory === category;
        return (
          <Button
            key={category}
            variant={isActive ? "default" : "secondary"}
            className={`whitespace-nowrap rounded-lg text-sm px-3.5 py-1.5 font-medium transition-colors ${
              isActive
                ? "bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            onClick={() => onSelectCategory?.(category)}
          >
            {category}
          </Button>
        );
      })}
    </div>
  );
}
