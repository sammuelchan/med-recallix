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
