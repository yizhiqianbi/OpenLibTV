import type {
  AssetRecord,
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
    if (!response.ok || record?.error) {
      throw new ServiceError(String(failure?.message || record?.message || '操作失败，请重试'), {
        status: response.status,
        code: String(failure?.code || `HTTP_${response.status}`),
        details: failure?.details,
      });
    }
    return (record && Object.hasOwn(record, 'data') ? record.data : payload) as T;
  }
  const collection = <T>(name: string): Collection<T> => ({
    list: (filters, options) => request('/' + name + query(filters), options),
    get: (id) => request('/' + name + '/' + encodeURIComponent(id)),
    create: (body) => request('/' + name, { method: 'POST', body }),
    update: (id, body) =>
      request('/' + name + '/' + encodeURIComponent(id), { method: 'PATCH', body }),
    remove: (id, { permanent = false } = {}) =>
      request('/' + name + '/' + encodeURIComponent(id) + query({ permanent }), {
        method: 'DELETE',
      }),
    restore: (id) =>
      request('/' + name + '/' + encodeURIComponent(id) + '/restore', { method: 'POST' }),
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
      save: (id: string, body: Partial<CanvasDocument>) =>
        request<CanvasDocument>('/projects/' + encodeURIComponent(id) + '/canvas', {
          method: 'PUT',
          body,
        }),
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
      cancel: (id: string) =>
        request<GenerationTask>('/tasks/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }),
      retry: (id: string) =>
        request<GenerationTask>('/tasks/' + encodeURIComponent(id) + '/retry', { method: 'POST' }),
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
    upload: async (files: Iterable<File>, options: Pick<RequestOptions, 'signal'> = {}) => {
      if (typeof FormData === 'undefined')
        throw new ServiceError('当前环境无法上传文件', { code: 'UPLOAD_UNAVAILABLE' });
      const body = new FormData();
      for (const file of files) body.append('files', file);
      return request<AssetRecord[]>('/uploads', { ...options, method: 'POST', body });
    },
  };
  return { request, api };
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
export const api = client.api;
