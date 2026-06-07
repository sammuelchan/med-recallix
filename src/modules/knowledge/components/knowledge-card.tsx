"use client";

import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { KPIndexItem } from "../knowledge.types";

const CATEGORY_COLORS = [
  "bg-orange-400",
  "bg-blue-400",
  "bg-green-400",
  "bg-purple-400",
  "bg-pink-400",
  "bg-teal-400",
  "bg-yellow-400",
  "bg-red-400",
  "bg-indigo-400",
  "bg-cyan-400",
];

function getCategoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash + category.charCodeAt(i)) | 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

interface KnowledgeCardProps {
  item: KPIndexItem;
}

export function KnowledgeCard({ item }: KnowledgeCardProps) {
  const rootCategory = item.category[0] ?? "";
  const colorClass = getCategoryColor(rootCategory);
  const displayTitle = item.displayTitle ?? item.title;

  return (
    <Link
      href={`/knowledge/${item.id}`}
      className="flex items-center rounded-xl border p-4 transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <div className={`w-1 self-stretch rounded-full ${colorClass} mr-3 shrink-0`} />
      <div className="min-w-0 flex-1">
        <h3 className="font-medium truncate">{displayTitle}</h3>
        {item.contentMode === "qa" && (
          <Badge variant="outline" className="text-xs mt-1">
            问答
          </Badge>
        )}
        {item.tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-2" />
    </Link>
  );
}
