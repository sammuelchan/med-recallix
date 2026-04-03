"use client";

import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { KPIndexItem } from "../knowledge.types";

interface KnowledgeCardProps {
  item: KPIndexItem;
}

export function KnowledgeCard({ item }: KnowledgeCardProps) {
  return (
    <Link
      href={`/knowledge/${item.id}`}
      className="flex items-center justify-between rounded-xl border p-4 transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-medium truncate">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {item.category.join(" / ")}
        </p>
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
