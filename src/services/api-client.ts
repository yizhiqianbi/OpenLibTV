import type {
  AssetRecord,
  AgentRun,
  AgentRunRequest,
  CanvasDocument,
  Collection,
  Folder,
  GenerationTask,
  ListFilters,
  Order,
  Project,
  RequestOptions,
  Session,
  ShareRecord,
  SkillRecord,
  XumengCharacter,
  XumengChatResponse,
  XumengHealth,
  XumengSession,
} from './contracts.ts';

export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(
    message: string,
    {
      status = 0,
      code = 'SERVICE_UNAVAILABLE',
      details = null,
    }: { status?: number; code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  onSessionExpired?: () => void;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const query = (values?: ListFilters | Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.size ? '?' + params : '';
};

/** The client is configured for the operator's service, with no request or browser access at import. */
export function createApiClient({ baseUrl, fetcher, onSessionExpired }: ClientOptions) {
  const base = baseUrl.replace(/\/$/, '');
  async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!base) throw new ServiceError('服务暂不可用，请稍后重试', { code: 'NOT_CONFIGURED' });
    const send = fetcher ?? globalThis.fetch;
    if (!send) throw new ServiceError('当前环境无法发送请求', { code: 'FETCH_UNAVAILABLE' });
    const { method = 'GET', body, headers, ...rest } = options;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !isForm && !requestHeaders.has('Content-Type'))
      requestHeaders.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await send(base + path, {
        credentials: 'include',
        ...rest,
        method,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: isForm ? (body as FormData) : JSON.stringify(body) }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ServiceError('网络连接失败，请重试', { code: 'NETWORK_ERROR', details: error });
    }
    if (response.status === 401) onSessionExpired?.();
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ServiceError(response.ok ? '服务返回了无法读取的数据' : '操作失败，请重试', {
          status: response.status,
          code: response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`,
        });
      }
    } else if (response.ok && response.status !== 204 && response.status !== 205) {
      throw new ServiceError('服务返回了空响应', {
        status: response.status,
        code: 'INVALID_RESPONSE',
      });
    }
    const record = isRecord(payload) ? payload : undefined;
    const failure = isRecord(record?.error) ? record.error : undefined;
    const stringFailure = typeof record?.error === 'string' ? record.error : undefined;
    if (!response.ok || record?.error) {
      throw new ServiceError(
        String(failure?.message || stringFailure || record?.message || '操作失败，请重试'),
        {
          status: response.status,
          code: String(failure?.code || `HTTP_${response.status}`),
          details: failure?.details,
        },
      );
    }
    return (record && Object.hasOwn(record, 'data') ? record.data : payload) as T;
  }
  async function requestStream(path: string, options: RequestOptions = {}): Promise<Response> {
    if (!base) throw new ServiceError('服务暂不可用，请稍后重试', { code: 'NOT_CONFIGURED' });
    const send = fetcher ?? globalThis.fetch;
    if (!send) throw new ServiceError('当前环境无法发送请求', { code: 'FETCH_UNAVAILABLE' });
    const { method = 'GET', body, headers, ...rest } = options;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !isForm && !requestHeaders.has('Content-Type'))
      requestHeaders.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await send(base + path, {
        credentials: 'include',
        ...rest,
        method,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: isForm ? (body as FormData) : JSON.stringify(body) }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ServiceError('网络连接失败，请重试', { code: 'NETWORK_ERROR', details: error });
    }
    if (response.status === 401) onSessionExpired?.();
    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text.trim() ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      const record = isRecord(payload) ? payload : undefined;
      const failure = isRecord(record?.error) ? record.error : undefined;
      const stringFailure = typeof record?.error === 'string' ? record.error : undefined;
      throw new ServiceError(
        String(failure?.message || stringFailure || record?.message || '操作失败，请重试'),
        {
          status: response.status,
          code: String(failure?.code || `HTTP_${response.status}`),
          details: failure?.details,
        },
      );
    }
    if (!response.body) throw new ServiceError('服务没有返回流式内容', { code: 'EMPTY_STREAM' });
    return response;
  }
  const collection = <T>(name: string): Collection<T> => ({
    list: (filters, options) => request('/' + name + query(filters), options),
    get: (id, options) => request('/' + name + '/' + encodeURIComponent(id), options),
    create: (body, options) => request('/' + name, { ...options, method: 'POST', body }),
    update: (id, body, options) =>
      request('/' + name + '/' + encodeURIComponent(id), { ...options, method: 'PATCH', body }),
    remove: (id, { permanent = false, ...options } = {}) =>
      request('/' + name + '/' + encodeURIComponent(id) + query({ permanent }), {
        ...options,
        method: 'DELETE',
      }),
    restore: (id, options) =>
      request('/' + name + '/' + encodeURIComponent(id) + '/restore', {
        ...options,
        method: 'POST',
      }),
  });
  const api = {
    content: <T = unknown>(name: string, options?: RequestOptions) =>
      request<T>('/content/' + name.split('/').map(encodeURIComponent).join('/'), options),
    auth: {
      session: () => request<Session>('/auth/session'),
      sendCode: (phone: string) =>
        request<{ expiresAt?: string }>('/auth/sms', { method: 'POST', body: { phone } }),
      login: (body: unknown) => request<Session>('/auth/login', { method: 'POST', body }),
      loginTicket: (provider: string) =>
        request<{ id: string; url?: string }>('/auth/tickets', {
          method: 'POST',
          body: { provider },
        }),
      ticket: (id: string) =>
        request<{ status: string; session?: Session }>('/auth/tickets/' + encodeURIComponent(id)),
      logout: () => request<void>('/auth/logout', { method: 'POST' }),
    },
    projects: collection<Project>('projects'),
    folders: collection<Folder>('folders'),
    assets: collection<AssetRecord>('assets'),
    skills: collection<SkillRecord>('skills'),
    canvas: {
      load: (id: string) =>
        request<CanvasDocument>('/projects/' + encodeURIComponent(id) + '/canvas'),
      save: (
        id: string,
        body: Partial<CanvasDocument>,
        options: Pick<RequestOptions, 'signal' | 'headers'> & { ifMatch?: string | number } = {},
      ) => {
        const { ifMatch, ...requestOptions } = options;
        const headers = new Headers(requestOptions.headers);
        if (ifMatch !== undefined) headers.set('If-Match', String(ifMatch));
        return request<CanvasDocument>('/projects/' + encodeURIComponent(id) + '/canvas', {
          ...requestOptions,
          headers,
          method: 'PUT',
          body,
        });
      },
      copy: (body: unknown) => request<Project>('/projects/copy', { method: 'POST', body }),
      share: (id: string, body: unknown) =>
        request<ShareRecord>('/projects/' + encodeURIComponent(id) + '/share', {
          method: 'POST',
          body,
        }),
    },
    generation: {
      create: (body: unknown) => request<GenerationTask>('/tasks', { method: 'POST', body }),
      get: (id: string) => request<GenerationTask>('/tasks/' + encodeURIComponent(id)),
      events: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        requestStream('/tasks/' + encodeURIComponent(id) + '/events', {
          ...options,
          method: 'GET',
        }),
      cancel: (id: string) =>
        request<GenerationTask>('/tasks/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }),
      retry: (id: string) =>
        request<GenerationTask>('/tasks/' + encodeURIComponent(id) + '/retry', { method: 'POST' }),
    },
    agent: {
      health: (options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        request('/agent/health', options),
      sessions: {
        list: (filters?: ListFilters, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
          request('/agent/sessions' + query(filters), options),
        get: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
          request('/agent/sessions/' + encodeURIComponent(id), options),
        create: (body: unknown, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
          request('/agent/sessions', { ...options, method: 'POST', body }),
        update: (
          id: string,
          body: unknown,
          options: Pick<RequestOptions, 'signal' | 'headers'> = {},
        ) =>
          request('/agent/sessions/' + encodeURIComponent(id), {
            ...options,
            method: 'PATCH',
            body,
          }),
        remove: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
          request<void>('/agent/sessions/' + encodeURIComponent(id), {
            ...options,
            method: 'DELETE',
          }),
      },
      create: (body: AgentRunRequest, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        request<AgentRun>('/agent/runs', { ...options, method: 'POST', body }),
      stream: (body: AgentRunRequest, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        requestStream('/agent/runs/stream', { ...options, method: 'POST', body }),
      events: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        requestStream('/agent/runs/' + encodeURIComponent(id) + '/events', {
          ...options,
          method: 'GET',
        }),
      get: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        request<AgentRun>('/agent/runs/' + encodeURIComponent(id), options),
      cancel: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        request<AgentRun>('/agent/runs/' + encodeURIComponent(id) + '/cancel', {
          ...options,
          method: 'POST',
        }),
      retry: (id: string, options: Pick<RequestOptions, 'signal' | 'headers'> = {}) =>
        request<AgentRun>('/agent/runs/' + encodeURIComponent(id) + '/retry', {
          ...options,
          method: 'POST',
        }),
    },
    checkout: {
      create: (body: unknown) => request<Order>('/orders', { method: 'POST', body }),
      get: (id: string) => request<Order>('/orders/' + encodeURIComponent(id)),
      cancel: (id: string) =>
        request<Order>('/orders/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }),
    },
    social: {
      like: (id: string, liked: boolean) =>
        request<{ liked: boolean }>('/works/' + encodeURIComponent(id) + '/like', {
          method: 'PUT',
          body: { liked },
        }),
      follow: (id: string, followed: boolean) =>
        request<{ followed: boolean }>('/profiles/' + encodeURIComponent(id) + '/follow', {
          method: 'PUT',
          body: { followed },
        }),
      favorite: (id: string, favorited: boolean) =>
        request<{ favorited: boolean }>('/skills/' + encodeURIComponent(id) + '/favorite', {
          method: 'PUT',
          body: { favorited },
        }),
    },
    xumeng: {
      health: () => request<XumengHealth>('/xumeng/health'),
      characters: collection<XumengCharacter>('xumeng/characters'),
      sessions: collection<XumengSession>('xumeng/sessions'),
      chat: (body: unknown, options: Pick<RequestOptions, 'signal'> = {}) =>
        request<XumengChatResponse>('/xumeng/chat', { ...options, method: 'POST', body }),
      chatStream: (body: unknown, options: Pick<RequestOptions, 'signal'> = {}) =>
        requestStream('/xumeng/chat', { ...options, method: 'POST', body }),
      memory: (body: unknown, options: Pick<RequestOptions, 'signal'> = {}) =>
        request('/xumeng/memory', { ...options, method: 'POST', body }),
      exportCard: (id: string) =>
        request<unknown>('/xumeng/characters/' + encodeURIComponent(id) + '/export'),
      importCard: (body: unknown) =>
        request<XumengCharacter>('/xumeng/characters/import', { method: 'POST', body }),
    },
    upload: async (files: Iterable<File>, options: Pick<RequestOptions, 'signal'> = {}) => {
      if (typeof FormData === 'undefined')
        throw new ServiceError('当前环境无法上传文件', { code: 'UPLOAD_UNAVAILABLE' });
      const body = new FormData();
      for (const file of files) body.append('files', file);
      return request<AssetRecord[]>('/uploads', { ...options, method: 'POST', body });
    },
  };
  return { request, requestStream, api };
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const apiBase = (env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const serverConnected = Boolean(apiBase);
const client = createApiClient({
  baseUrl: apiBase,
  onSessionExpired: () => {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined')
      window.dispatchEvent(new CustomEvent('libtv-session-expired'));
  },
});
export const request = client.request;
export const requestStream = client.requestStream;
export const api = client.api;
