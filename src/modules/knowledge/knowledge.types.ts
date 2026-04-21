/**
 * Knowledge Domain Types
 *
 * KnowledgePoint — full record with title, content, category path, and tags
 * KPIndexItem    — lightweight index row (no content) for list rendering
 * CategoryNode   — tree node with name, children, and KP count
 * CategoryTree   — root-level container for the category hierarchy
 */

export interface KnowledgePoint {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KPIndexItem {
  id: string;
  title: string;
  category: string[];
  tags: string[];
  updatedAt: string;
}

export interface CategoryNode {
  name: string;
  children: CategoryNode[];
  count: number;
}

export interface CategoryTree {
  roots: CategoryNode[];
}
