/** Versioned protocol shared by authoring, the standalone player and publishing. */
export type FilmKind =
  'start' | 'play' | 'choice' | 'set' | 'condition' | 'hotspot' | 'qte' | 'ending';
export type FilmValue = number | boolean;
export interface FilmVariable {
  id: string;
  name: string;
  type: 'number' | 'boolean';
  initial: FilmValue;
}
export interface FilmChoice {
  id: string;
  text: string;
}
export interface FilmRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FilmNode {
  id: string;
  kind: FilmKind;
  title: string;
  position: { x: number; y: number };
  mediaId?: string;
  trimIn?: number;
  trimOut?: number;
  displaySeconds?: number;
  prompt?: string;
  choices?: FilmChoice[];
  windowStart?: number;
  windowEnd?: number;
  variableId?: string;
  operation?: 'set' | 'add';
  value?: FilmValue;
  comparator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  region?: FilmRegion;
  endingText?: string;
}
export interface FilmEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
}
export interface FilmMedia {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
}
export interface FilmDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  revision: number;
  savedAt: number;
  nodes: FilmNode[];
  edges: FilmEdge[];
  variables: FilmVariable[];
  media: FilmMedia[];
  view: { x: number; y: number; z: number };
  deletedAt?: number;
}
export interface FilmManifest {
  schemaVersion: 1;
  runtimeVersion: '1';
  title: string;
  revision: number;
  startNodeId: string;
  nodes: FilmNode[];
  edges: FilmEdge[];
  variables: FilmVariable[];
  media: Record<string, FilmMedia & { url: string }>;
}
export interface FilmIssue {
  code: string;
  message: string;
  nodeId?: string;
}
export interface FilmPort {
  id: string;
  label: string;
}
export interface FilmRelease {
  releaseId: string;
  manifest: FilmManifest;
  runtimeUrl: string;
  runtimeSha256: string;
}
