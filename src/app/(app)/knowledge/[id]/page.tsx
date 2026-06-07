"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { KnowledgeForm } from "@/modules/knowledge/components/knowledge-form";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";
import { ReviewTimeline } from "@/modules/review/components/review-timeline";
import type { KnowledgePoint, ContentMode, QAPair } from "@/modules/knowledge";

export default function KnowledgeDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [kp, setKp] = useState<KnowledgePoint | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/knowledge/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setKp(json.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleUpdate(data: {
    title: string;
    content: string;
    contentMode: ContentMode;
    qaItems?: QAPair[];
    category: string[];
    tags: string[];
  }) {
    const res = await fetch(`/api/knowledge/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "更新失败");
    setKp(json.data);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm("确定要删除这个知识点吗？关联的复习卡片也会被删除。")) return;
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/knowledge");
      router.refresh();
    }
  }

  if (loading) {
    return (
      <>
        <Header title="知识点" />
        <PageContainer className="flex items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </PageContainer>
      </>
    );
  }

  if (!kp) {
    return (
      <>
        <Header title="知识点" />
        <PageContainer className="flex items-center justify-center">
          <p className="text-muted-foreground">知识点不存在</p>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header
        title={editing ? "编辑知识点" : kp.title}
        action={
          <div className="flex gap-1">
            {!editing && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </>
            )}
            {editing && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditing(false)}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
          </div>
        }
      />
      <PageContainer>
        {editing ? (
          <KnowledgeForm
            initialData={kp}
            onSubmit={handleUpdate}
            submitLabel="保存修改"
          />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {kp.category.join(" / ")}
              </p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {kp.contentMode === "qa" && (
                  <Badge variant="outline">问答式</Badge>
                )}
                {kp.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {kp.contentMode === "qa" && kp.qaItems && kp.qaItems.length > 0 ? (
              <div className="space-y-3">
                {kp.qaItems.map((qa, idx) => (
                  <div key={qa.id} className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Q{idx + 1}
                    </p>
                    <p className="text-sm font-medium">{qa.question}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {qa.answer}
                    </p>
                    {qa.blanks && qa.blanks.length > 0 && (
                      <p className="text-xs text-primary/70">
                        {qa.blanks.length} 个填空点
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {kp.content}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              更新于 {new Date(kp.updatedAt).toLocaleString("zh-CN")}
            </p>

            <ReviewTimeline kpId={id} />
          </div>
        )}
      </PageContainer>
    </>
  );
}
