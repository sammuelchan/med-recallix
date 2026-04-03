"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { KnowledgeForm } from "@/modules/knowledge/components/knowledge-form";

export default function NewKnowledgePage() {
  const router = useRouter();

  async function handleSubmit(data: {
    title: string;
    content: string;
    category: string[];
    tags: string[];
    addToReview?: boolean;
  }) {
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "创建失败");

    router.push("/knowledge");
    router.refresh();
  }

  return (
    <>
      <Header title="新建知识点" />
      <PageContainer>
        <KnowledgeForm onSubmit={handleSubmit} submitLabel="创建" />
      </PageContainer>
    </>
  );
}
