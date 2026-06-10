"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Input } from "@/shared/components/ui/input";
import { KnowledgeCard } from "@/modules/knowledge/components/knowledge-card";
import { Plus, Search, X, Sparkles } from "lucide-react";
import { cachedFetch } from "@/shared/lib/fetch-cache";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { KPIndexItem } from "@/modules/knowledge";

export default function KnowledgePage() {
  const [items, setItems] = useState<KPIndexItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    cachedFetch<{ success: boolean; data?: KPIndexItem[] }>("/api/knowledge", { ttl: 15_000 })
      .then((json) => {
        if (json.success && json.data) setItems(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    items.forEach((item) => {
      if (item.category[0]) catSet.add(item.category[0]);
    });
    return Array.from(catSet);
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;

    if (selectedCategory) {
      result = result.filter((item) => item.category[0] === selectedCategory);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          (item.displayTitle ?? item.title).toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)) ||
          item.category.some((c) => c.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [items, search, selectedCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, KPIndexItem[]>();
    for (const item of filtered) {
      const key = item.category[0] ?? "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [filtered]);

  return (
    <>
      <Header
        title="知识点"
        action={
          <div className="flex items-center gap-1">
            <Link
              href="/knowledge/exam"
              className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors"
              aria-label="问答测验"
            >
              <Sparkles className="size-5" />
            </Link>
            <Link
              href="/knowledge/new"
              className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80 transition-opacity"
              aria-label="新建知识点"
            >
              <Plus className="size-5" />
            </Link>
          </div>
        }
      />
      <PageContainer>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索知识点..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors active:scale-95 ${
                  !selectedCategory
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                全部
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === cat ? null : cat)
                  }
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors active:scale-95 ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {selectedCategory && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>筛选: {selectedCategory}</span>
              <button
                onClick={() => setSelectedCategory(null)}
                className="rounded-full p-2 hover:bg-muted active:bg-muted/80"
                aria-label="清除筛选"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-4xl mb-4">📝</p>
              <p>{search || selectedCategory ? "没有匹配的知识点" : "还没有知识点"}</p>
              <p className="text-sm mt-1">
                <Link href="/knowledge/new" className="text-primary hover:underline">
                  添加第一个知识点
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([category, groupItems]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    {category} ({groupItems.length})
                  </h4>
                  <div className="space-y-2">
                    {groupItems.map((item) => (
                      <KnowledgeCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
