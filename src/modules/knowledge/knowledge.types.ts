/**
 * Knowledge Domain Types
 *
 * KnowledgePoint — full record with title, content, category path, and tags
 * KPIndexItem    — lightweight index row (no content) for list rendering
 * CategoryNode   — tree node with name, children, and KP count
 * CategoryTree   — root-level container for the category hierarchy
 * QAPair         — question-answer pair for Q&A mode
 * BlankPosition  — position of a masked word/phrase in fill-blank mode
 */

export type ContentMode = "text" | "qa";

export interface BlankPosition {
  start: number;
  end: number;
  text: string;
}

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  blanks?: BlankPosition[];
}

export interface KnowledgePoint {
  id: string;
  userId: string;
  title: string;
  displayTitle: string;
  contentMode: ContentMode;
  content: string;
  qaItems?: QAPair[];
  category: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KPIndexItem {
  id: string;
  title: string;
  displayTitle: string;
  contentMode: ContentMode;
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
