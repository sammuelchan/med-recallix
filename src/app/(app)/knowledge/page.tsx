"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Input } from "@/shared/components/ui/input";
import { KnowledgeCard } from "@/modules/knowledge/components/knowledge-card";
import { Plus, Search } from "lucide-react";
import type { KPIndexItem } from "@/modules/knowledge";

export default function KnowledgePage() {
  const [items, setItems] = useState<KPIndexItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setItems(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(search.toLowerCase()) ||
          item.tags.some((t) => t.includes(search)),
      )
    : items;

  return (
    <>
      <Header
        title="知识点"
        action={
          <Link
            href="/knowledge/new"
            className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <Plus className="size-4" />
          </Link>
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

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-4xl mb-4">📝</p>
              <p>{search ? "没有匹配的知识点" : "还没有知识点"}</p>
              <p className="text-sm mt-1">
                <Link href="/knowledge/new" className="text-primary hover:underline">
                  添加第一个知识点
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <KnowledgeCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
