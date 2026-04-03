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
  async create(userId: string, input: CreateKPInput): Promise<KnowledgePoint> {
    const id = generateId();
    const now = new Date().toISOString();

    const kp: KnowledgePoint = {
      id,
      userId,
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    await kvPut(kvKeys.knowledgePoint(userId, id), kp);

    const index = await this.getIndex(userId);
    index.push({
      id,
      title: kp.title,
      category: kp.category,
      tags: kp.tags,
      updatedAt: now,
    });
    await kvPut(kvKeys.knowledgeIndex(userId), index);

    await this.rebuildCategoryTree(userId, index);

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
    const existing = await this.get(userId, kpId);
    const now = new Date().toISOString();

    const updated: KnowledgePoint = {
      ...existing,
      ...input,
      updatedAt: now,
    };

    await kvPut(kvKeys.knowledgePoint(userId, kpId), updated);

    const index = await this.getIndex(userId);
    const idx = index.findIndex((item) => item.id === kpId);
    if (idx >= 0) {
      index[idx] = {
        id: kpId,
        title: updated.title,
        category: updated.category,
        tags: updated.tags,
        updatedAt: now,
      };
      await kvPut(kvKeys.knowledgeIndex(userId), index);
      await this.rebuildCategoryTree(userId, index);
    }

    return updated;
  },

  async delete(userId: string, kpId: string): Promise<void> {
    await kvDelete(kvKeys.knowledgePoint(userId, kpId));

    const index = await this.getIndex(userId);
    const filtered = index.filter((item) => item.id !== kpId);
    await kvPut(kvKeys.knowledgeIndex(userId), filtered);
    await this.rebuildCategoryTree(userId, filtered);
  },

  async getIndex(userId: string): Promise<KPIndexItem[]> {
    return (await kvGet<KPIndexItem[]>(kvKeys.knowledgeIndex(userId))) ?? [];
  },

  async getCategoryTree(userId: string): Promise<CategoryTree> {
    return (
      (await kvGet<CategoryTree>(kvKeys.category(userId))) ?? { roots: [] }
    );
  },

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
