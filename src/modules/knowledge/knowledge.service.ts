/**
 * Knowledge Point Service
 *
 * CRUD for medical knowledge points with:
 *   - Per-user KV storage (each KP stored individually for fast access)
 *   - Lightweight index (KPIndexItem[]) for list/search without loading full content
 *   - Hierarchical category tree rebuilt on every write for category navigation
 *   - Parallelized KV operations for optimal performance
 *
 * Data model:
 *   KP record  → kvKeys.knowledgePoint(userId, kpId) → full KnowledgePoint
 *   KP index   → kvKeys.knowledgeIndex(userId)       → KPIndexItem[]
 *   Categories → kvKeys.category(userId)              → CategoryTree
 */

import { kvGet, kvPut, kvDelete, kvKeys } from "@/shared/infrastructure/kv";
import { generateId } from "@/shared/lib/utils";
import { NotFoundError } from "@/shared/lib/errors";
import type {
  KnowledgePoint,
  KPIndexItem,
  CategoryTree,
  CategoryNode,
} from "./knowledge.types";
import type { CreateKPInput, UpdateKPInput } from "./knowledge.schema";

export const KnowledgeService = {
  generateDisplayTitle(
    title: string,
    category: string[],
    existingTitles?: string[],
  ): string {
    const base =
      category.length > 0
        ? `${category.join(" > ")} > ${title}`
        : title;

    if (!existingTitles || !existingTitles.includes(base)) {
      return base;
    }

    const dateStr = new Date().toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
    return `${base} (${dateStr})`;
  },

  async create(userId: string, input: CreateKPInput): Promise<KnowledgePoint> {
    const id = generateId();
    const now = new Date().toISOString();

    // Parallel: read index while preparing KP
    const index = await this.getIndex(userId);
    const existingTitles = index.map((item) => item.displayTitle);

    const displayTitle = this.generateDisplayTitle(
      input.title,
      input.category,
      existingTitles,
    );

    const kp: KnowledgePoint = {
      id,
      userId,
      title: input.title,
      displayTitle,
      contentMode: input.contentMode ?? "text",
      content: input.content ?? "",
      qaItems: input.qaItems,
      category: input.category,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    const indexItem: KPIndexItem = {
      id,
      title: kp.title,
      displayTitle: kp.displayTitle,
      contentMode: kp.contentMode,
      category: kp.category,
      tags: kp.tags,
      updatedAt: now,
    };

    index.push(indexItem);

    // Parallel batch: persist KP + index simultaneously
    await Promise.all([
      kvPut(kvKeys.knowledgePoint(userId, id), kp),
      kvPut(kvKeys.knowledgeIndex(userId), index),
    ]);

    // Fire-and-forget: category tree rebuild (non-critical path)
    this.rebuildCategoryTree(userId, index).catch(() => {});

    return kp;
  },

  async list(
    userId: string,
    category?: string,
  ): Promise<KPIndexItem[]> {
    const index = await this.getIndex(userId);
    if (!category) return index;
    return index.filter((item) => item.category.includes(category));
  },

  async get(userId: string, kpId: string): Promise<KnowledgePoint> {
    const kp = await kvGet<KnowledgePoint>(
      kvKeys.knowledgePoint(userId, kpId),
    );
    if (!kp) throw new NotFoundError("知识点");
    return kp;
  },

  async update(
    userId: string,
    kpId: string,
    input: UpdateKPInput,
  ): Promise<KnowledgePoint> {
    const [existing, index] = await Promise.all([
      this.get(userId, kpId),
      this.getIndex(userId),
    ]);
    const now = new Date().toISOString();

    const updated: KnowledgePoint = {
      ...existing,
      ...input,
      updatedAt: now,
    };

    if (input.title || input.category) {
      const existingTitles = index
        .filter((item) => item.id !== kpId)
        .map((item) => item.displayTitle);
      updated.displayTitle = this.generateDisplayTitle(
        updated.title,
        updated.category,
        existingTitles,
      );
    }

    const idx = index.findIndex((item) => item.id === kpId);
    if (idx >= 0) {
      index[idx] = {
        id: kpId,
        title: updated.title,
        displayTitle: updated.displayTitle,
        contentMode: updated.contentMode,
        category: updated.category,
        tags: updated.tags,
        updatedAt: now,
      };
    }

    // Parallel: persist KP + index simultaneously
    await Promise.all([
      kvPut(kvKeys.knowledgePoint(userId, kpId), updated),
      kvPut(kvKeys.knowledgeIndex(userId), index),
    ]);

    this.rebuildCategoryTree(userId, index).catch(() => {});

    return updated;
  },

  async delete(userId: string, kpId: string): Promise<void> {
    // Parallel: delete KP record + read index
    const [, index] = await Promise.all([
      kvDelete(kvKeys.knowledgePoint(userId, kpId)),
      this.getIndex(userId),
    ]);
    const filtered = index.filter((item) => item.id !== kpId);
    await kvPut(kvKeys.knowledgeIndex(userId), filtered);
    this.rebuildCategoryTree(userId, filtered).catch(() => {});
  },

  async getIndex(userId: string): Promise<KPIndexItem[]> {
    return (await kvGet<KPIndexItem[]>(kvKeys.knowledgeIndex(userId))) ?? [];
  },

  async getCategoryTree(userId: string): Promise<CategoryTree> {
    return (
      (await kvGet<CategoryTree>(kvKeys.category(userId))) ?? { roots: [] }
    );
  },

  /**
   * Rebuild category tree from index — walks each KP's category[] path
   * (e.g. ["内科", "心血管", "高血压"]) to build a nested CategoryNode tree
   * with per-node count. Persisted to KV for fast category nav rendering.
   */
  async rebuildCategoryTree(
    userId: string,
    index: KPIndexItem[],
  ): Promise<void> {
    const rootMap = new Map<string, CategoryNode>();

    for (const item of index) {
      if (item.category.length === 0) continue;

      const [root, ...rest] = item.category;
      if (!rootMap.has(root)) {
        rootMap.set(root, { name: root, children: [], count: 0 });
      }
      const rootNode = rootMap.get(root)!;
      rootNode.count++;

      let parent = rootNode;
      for (const seg of rest) {
        let child = parent.children.find((c) => c.name === seg);
        if (!child) {
          child = { name: seg, children: [], count: 0 };
          parent.children.push(child);
        }
        child.count++;
        parent = child;
      }
    }

    const tree: CategoryTree = {
      roots: Array.from(rootMap.values()),
    };
    await kvPut(kvKeys.category(userId), tree);
  },
};
