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
  characterId?: Id;
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
export type AgentPartType =
  'text' | 'skill' | 'model' | 'image' | 'video' | 'audio' | 'document' | 'node';
export interface AgentPart {
  type: AgentPartType;
  text?: string;
  id?: Id;
  name?: string;
  nodeKey?: Id;
  source?: { kind?: string; value?: string };
  metadata?: Record<string, unknown>;
  status?: string;
  [key: string]: unknown;
}
export interface AgentMessage {
  id: Id;
  runId?: Id;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text?: string;
  parts?: AgentPart[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}
export interface AgentRun {
  id: Id;
  sessionId?: Id;
  projectId?: Id;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  assistantMessage?: AgentMessage;
  taskId?: Id;
  documentPatch?: Record<string, unknown>;
  error?: ApiErrorBody;
  createdAt: string;
  updatedAt: string;
}
export interface AgentRunRequest {
  requestId: Id;
  projectId?: Id;
  sessionId?: Id;
  documentRevision?: number;
  mode?: string;
  model?: string;
  skill?: string;
  parts: AgentPart[];
  plainText: string;
  serialized: string;
  references?: AgentPart[];
  nodeSnapshot?: CanvasNode[];
  agentConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
export type AgentRunEvent =
  | { type: 'run'; run: AgentRun }
  | { type: 'message.delta'; runId: Id; delta: string }
  | { type: 'message.completed'; runId: Id; message: AgentMessage }
  | { type: 'statePatch'; runId: Id; patch: Record<string, unknown> }
  | { type: 'documentPatch'; runId: Id; patch: Record<string, unknown>; revision?: number }
  | { type: 'task'; runId: Id; task: GenerationTask }
  | { type: 'error'; runId?: Id; error: ApiErrorBody }
  | { type: 'done'; runId: Id; status: AgentRun['status'] };
export type XumengMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface XumengMessage {
  id?: Id;
  role: XumengMessageRole;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}
export interface XumengStateDefinition {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'enum';
  initial: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}
export interface XumengWorldBookEntry {
  id: Id;
  name?: string;
  keys: string[];
  content: string;
  enabled?: boolean;
  constant?: boolean;
  selective?: boolean;
  secondaryKeys?: string[];
  priority?: number;
  insertionOrder?: number;
  position?: 'before_char' | 'after_char';
}
export interface XumengCharacterBook {
  name?: string;
  scanDepth?: number;
  entries: XumengWorldBookEntry[];
}
export interface XumengCharacter {
  id: Id;
  schemaVersion: 1;
  author?: string;
  creatorNotes?: string;
  characterVersion?: string;
  tags?: string[];
  name: string;
  introduction?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings?: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  messageExamples?: string;
  exampleDialogue?: string;
  suggestedReplies?: string[];
  stateSchema?: XumengStateDefinition[];
  characterBook?: XumengCharacterBook;
  worldBook?: XumengWorldBookEntry[];
  visibility?: 'private' | 'unlisted' | 'public';
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface XumengSession {
  id: Id;
  characterId: Id;
  title: string;
  messages: XumengMessage[];
  state: Record<string, JsonPrimitive>;
  memory?: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface XumengChatRequest {
  characterId?: Id;
  character?: Partial<XumengCharacter>;
  sessionId?: Id;
  messages: XumengMessage[];
  state?: Record<string, JsonPrimitive>;
  memory?: string[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}
export interface XumengChatResponse {
  sessionId: Id;
  message: XumengMessage;
  statePatch?: Record<string, JsonPrimitive>;
  memoryAppend?: string[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}
export interface XumengHealth {
  configured: boolean;
  provider?: string;
  model?: string;
  models?: Record<string, string>;
  capabilities?: string[];
}
/** Existing public snapshots retain their source fields; normalization belongs in repositories. */
export type ContentRecord = Record<string, unknown>;
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}
export interface Collection<T, Create = Partial<T>, Update = Partial<T>> {
  list(
    filters?: ListFilters,
    options?: Pick<RequestOptions, 'signal' | 'headers'>,
  ): Promise<Page<T>>;
  get(id: Id, options?: Pick<RequestOptions, 'signal' | 'headers'>): Promise<T>;
  create(body: Create, options?: Pick<RequestOptions, 'signal' | 'headers'>): Promise<T>;
  update(id: Id, body: Update, options?: Pick<RequestOptions, 'signal' | 'headers'>): Promise<T>;
  remove(
    id: Id,
    options?: { permanent?: boolean; signal?: AbortSignal; headers?: HeadersInit },
  ): Promise<void>;
  restore(id: Id, options?: Pick<RequestOptions, 'signal' | 'headers'>): Promise<T>;
}
