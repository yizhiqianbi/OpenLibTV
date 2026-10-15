/** Contracts for the operator-owned backend; original authenticated services are never used. */
export type Id = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
export type ApiEnvelope<T> = { data: T; error?: never } | { data?: never; error: ApiErrorBody };
export interface Page<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: string | null;
}
export interface ListFilters {
  query?: string;
  folderId?: Id | null;
  deleted?: boolean;
  type?: string;
  cursor?: string;
  limit?: number;
}
export interface Folder {
  id: Id;
  name: string;
  parentId: Id | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Project {
  id: Id;
  name: string;
  type: 'canvas' | 'studio';
  folderId: Id | null;
  coverUrl?: string;
  nodeCount?: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface AssetRecord {
  id: Id;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'model';
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  /** Optional JSON v2 node collection, mapped by the operator's asset adapter. */
  assetData?: string;
  bytes: number;
  folderId: Id | null;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface SkillRecord {
  id: Id;
  name: string;
  description: string;
  coverUrl?: string;
  markdownContent: string;
  files?: { path: string; content: string }[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface CanvasNode {
  id: Id;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, unknown>;
}
export interface CanvasEdge {
  id: Id;
  source: Id;
  target: Id;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}
export interface CanvasDocument {
  projectId: Id;
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  view: { x: number; y: number; z: number };
  revision: number;
  updatedAt: string;
}
export interface GenerationTask {
  id: Id;
  projectId: Id;
  nodeId: Id;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number;
  output?: AssetRecord[];
  error?: ApiErrorBody;
  createdAt: string;
  updatedAt: string;
}
export interface Order {
  id: Id;
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';
  amount: number;
  currency: string;
  paymentUrl?: string;
  expiresAt?: string;
}
export interface Session {
  user: { id: Id; name: string; avatarUrl?: string } | null;
  expiresAt?: string;
}
export interface ShareRecord {
  id: Id;
  url: string;
  visibility: 'public' | 'private';
}
/** Existing public snapshots retain their source fields; normalization belongs in repositories. */
export type ContentRecord = Record<string, unknown>;
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}
export interface Collection<T, Create = Partial<T>, Update = Partial<T>> {
  list(filters?: ListFilters, options?: Pick<RequestOptions, 'signal'>): Promise<Page<T>>;
  get(id: Id): Promise<T>;
  create(body: Create): Promise<T>;
  update(id: Id, body: Update): Promise<T>;
  remove(id: Id, options?: { permanent?: boolean }): Promise<void>;
  restore(id: Id): Promise<T>;
}
