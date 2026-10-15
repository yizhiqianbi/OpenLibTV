/** Caller-provided operational readers. No original-site client or generation writer is installed. */
export interface StoryboardVideoFeeRequest {
  params: {
    prompt: '';
    model: string;
    modeType: string;
    count: 1;
    settings: Record<string, unknown>;
  };
  metadata: { node_id: string; project_id: string };
  provider: string;
  model: string;
  taskType: 'video';
  requestId: string;
}

export interface StoryboardPortraitResult {
  childId: string;
  url: string;
  status: 'approved';
  checkedAtMs: number;
  assetId?: string;
  exempt?: true;
}

export interface StoryboardVideoSource {
  estimatePower?: (
    request: StoryboardVideoFeeRequest,
    options: { signal: AbortSignal },
  ) => Promise<{
    code: number;
    data?: { power?: number | string; originalPrice?: number | string };
  }>;
  checkPortrait?: (
    request: {
      projectId: string;
      nodeId: string;
      model: string;
      images: Array<{ childId: string; url: string }>;
    },
    options: { signal: AbortSignal },
  ) => Promise<StoryboardPortraitResult[]>;
  /** ScriptV2 audits its linked asset nodes, independently of v1 shot images. */
  checkV2Portrait?: (
    request: {
      projectId: string;
      nodeId: string;
      model: string;
      images: ScriptV2PortraitReference[];
    },
    options: { signal: AbortSignal },
  ) => Promise<ScriptV2PortraitResult[]>;
}

export interface ScriptV2PortraitReference {
  nodeId: string;
  linkedNodeId: string;
  assetIds: string[];
  url: string;
  originalUrl: string[];
  assetId?: string;
  compliantExempt?: true;
  complianceCheckedAtMs?: number;
  sourceCreatedAtMs?: number;
  sourceCreatedAtMsIsLocalPlaceholder?: boolean;
}

export interface ScriptV2PortraitResult {
  nodeId: string;
  url: string;
  status: 'approved';
  checkedAtMs: number;
  assetId?: string;
  exempt?: true;
}
