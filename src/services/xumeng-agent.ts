import type {
  ApiErrorBody,
  Id,
  Page,
  XumengCharacter,
  XumengChatRequest,
  XumengChatResponse,
  XumengHealth,
  XumengMessage,
  XumengSession,
  XumengStateDefinition,
  XumengWorldBookEntry,
} from './contracts.ts';
import { api, ServiceError } from './api-client.ts';

const CHARACTER_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_TEXT = 100_000;

export interface XumengCharacterInput {
  name: string;
  author?: string;
  creatorNotes?: string;
  characterVersion?: string;
  tags?: string[];
  introduction?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings?: string[];
  exampleDialogue?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  messageExamples?: string;
  worldBook?: XumengWorldBookEntry[];
  characterBook?: XumengCharacter['characterBook'];
  suggestedReplies?: string[];
  stateSchema?: XumengStateDefinition[];
  visibility?: XumengCharacter['visibility'];
}

export interface XumengSessionInput {
  characterId: Id;
  title?: string;
  state?: Record<string, string | number | boolean | null>;
}

export interface XumengStreamEvent {
  delta?: string;
  statePatch?: Record<string, string | number | boolean | null>;
  memoryAppend?: string[];
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max)
    throw new Error(`${field} 无效`);
  return value;
}

function optionalText(value: unknown, field: string, max = MAX_TEXT): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, field, max);
}

function validateBook(value: unknown): XumengCharacter['characterBook'] | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('世界书格式无效');
  const book = value as Record<string, unknown>;
  if (!Array.isArray(book.entries) || book.entries.length > 200)
    throw new Error('世界书条目数量无效');
  const ids = new Set<string>();
  const entries = book.entries.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('世界书条目无效');
    const row = item as Record<string, unknown>;
    const id = text(row.id, '世界书编号', 128);
    if (ids.has(id)) throw new Error('世界书编号重复');
    ids.add(id);
    if (row.keys === undefined) throw new Error('世界书关键词不能为空');
    if (!Array.isArray(row.keys) || row.keys.length > 20) throw new Error('世界书关键词数量无效');
    const keys = row.keys.map((key) => text(key, '世界书关键词', 200));
    if (!keys.length && row.constant !== true) throw new Error('世界书关键词不能为空');
    return {
      id,
      ...(row.name === undefined ? {} : { name: text(row.name, '世界书名称', 200) }),
      keys,
      content: text(row.content, '世界书内容', 8_000),
      ...(typeof row.enabled === 'boolean' ? { enabled: row.enabled } : {}),
      ...(typeof row.constant === 'boolean' ? { constant: row.constant } : {}),
      ...(typeof row.selective === 'boolean' ? { selective: row.selective } : {}),
      ...(row.secondaryKeys === undefined
        ? {}
        : !Array.isArray(row.secondaryKeys) || row.secondaryKeys.length > 20
          ? (() => {
              throw new Error('世界书副关键词数量无效');
            })()
          : {
              secondaryKeys: row.secondaryKeys.map((key) => text(key, '世界书副关键词', 200)),
            }),
      ...(row.insertionOrder === undefined
        ? {}
        : Number.isSafeInteger(row.insertionOrder) &&
            Number(row.insertionOrder) >= 0 &&
            Number(row.insertionOrder) <= 100_000
          ? { insertionOrder: Number(row.insertionOrder) }
          : (() => {
              throw new Error('世界书顺序无效');
            })()),
      ...(row.position === undefined
        ? {}
        : row.position === 'before_char' || row.position === 'after_char'
          ? { position: row.position }
          : (() => {
              throw new Error('世界书位置无效');
            })()),
    } satisfies XumengWorldBookEntry;
  });
  return {
    ...(book.name === undefined ? {} : { name: text(book.name, '世界书名称', 200) }),
    ...(book.scanDepth === undefined
      ? {}
      : Number.isSafeInteger(book.scanDepth) &&
          Number(book.scanDepth) >= 1 &&
          Number(book.scanDepth) <= 40
        ? { scanDepth: Number(book.scanDepth) }
        : (() => {
            throw new Error('世界书扫描深度无效');
          })()),
    entries,
  };
}

function validateStateSchema(value: unknown): XumengStateDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 32) throw new Error('状态定义无效');
  const keys = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('状态定义无效');
    const row = item as Record<string, unknown>;
    const key = text(row.key, '状态键', 64);
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key) || keys.has(key)) throw new Error('状态键无效');
    keys.add(key);
    const type = row.type;
    if (!['number', 'boolean', 'string', 'enum'].includes(String(type)))
      throw new Error('状态类型无效');
    const initial = row.initial;
    if (!['string', 'number', 'boolean'].includes(typeof initial))
      throw new Error('状态初始值无效');
    if (typeof initial === 'number' && !Number.isFinite(initial)) throw new Error('状态初始值无效');
    const options =
      row.options === undefined
        ? undefined
        : !Array.isArray(row.options) || row.options.length > 32
          ? (() => {
              throw new Error('状态选项无效');
            })()
          : row.options.map((option) => text(option, '状态选项', 200));
    return {
      key,
      label: text(row.label, '状态名称', 200),
      type: type as XumengStateDefinition['type'],
      initial: initial as string | number | boolean,
      ...(row.min === undefined
        ? {}
        : typeof row.min === 'number' && Number.isFinite(row.min)
          ? { min: row.min }
          : (() => {
              throw new Error('状态下限无效');
            })()),
      ...(row.max === undefined
        ? {}
        : typeof row.max === 'number' && Number.isFinite(row.max)
          ? { max: row.max }
          : (() => {
              throw new Error('状态上限无效');
            })()),
      ...(options ? { options } : {}),
      ...(row.description === undefined
        ? {}
        : { description: text(row.description, '状态说明', 2_000) }),
    } satisfies XumengStateDefinition;
  });
}

function validateState(
  value: unknown,
): Record<string, string | number | boolean | null> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('状态格式无效');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 32) throw new Error('状态字段过多');
  return Object.fromEntries(
    entries.map(([key, item]) => {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) throw new Error('状态键无效');
      if (item !== null && !['string', 'number', 'boolean'].includes(typeof item))
        throw new Error('状态值无效');
      if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('状态值无效');
      return [key, item as string | number | boolean | null];
    }),
  );
}

export function validateXumengCharacterInput(value: unknown): XumengCharacterInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('角色卡格式无效');
  const row = value as Record<string, unknown>;
  const rawBook =
    row.characterBook ?? (Array.isArray(row.worldBook) ? { entries: row.worldBook } : undefined);
  const result = {
    author: optionalText(row.author, '作者', 200),
    creatorNotes: optionalText(row.creatorNotes, '作者备注', 12_000),
    characterVersion: optionalText(row.characterVersion, '角色版本', 200),
    tags:
      row.tags === undefined
        ? undefined
        : !Array.isArray(row.tags) || row.tags.length > 32
          ? (() => {
              throw new Error('标签数量无效');
            })()
          : row.tags.map((item) => text(item, '标签', 100)),
    name: text(row.name, '角色名', 200),
    introduction: optionalText(row.introduction, '简介', 12_000),
    description: text(row.description, '角色描述'),
    personality: text(row.personality, '性格设定'),
    scenario: text(row.scenario, '场景设定'),
    firstMessage: text(row.firstMessage, '开场白'),
    alternateGreetings: Array.isArray(row.alternateGreetings)
      ? row.alternateGreetings.map((item) => text(item, '备选开场白', 20_000))
      : undefined,
    exampleDialogue: optionalText(row.exampleDialogue, '示例对话', 20_000),
    systemPrompt: optionalText(row.systemPrompt, '系统提示', 20_000),
    postHistoryInstructions: optionalText(row.postHistoryInstructions, '历史指令', 20_000),
    messageExamples: optionalText(row.messageExamples, '消息示例', 20_000),
    worldBook: undefined,
    characterBook: validateBook(rawBook),
    suggestedReplies: Array.isArray(row.suggestedReplies)
      ? row.suggestedReplies.length > 20
        ? (() => {
            throw new Error('建议回复数量无效');
          })()
        : row.suggestedReplies.map((item) => text(item, '建议回复', 500))
      : undefined,
    stateSchema: validateStateSchema(row.stateSchema),
    visibility: ['private', 'unlisted', 'public'].includes(String(row.visibility))
      ? (row.visibility as XumengCharacter['visibility'])
      : undefined,
  } satisfies XumengCharacterInput;
  return result;
}

export function normalizeXumengCard(value: unknown): XumengCharacterInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('角色卡格式无效');
  const row = value as Record<string, unknown>;
  const data =
    row.spec === 'chara_card_v2' && row.data && typeof row.data === 'object' ? row.data : row;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('角色卡数据无效');
  const source = data as Record<string, unknown>;
  const characterBook = source.characterBook ?? source.character_book;
  const book =
    characterBook && typeof characterBook === 'object' && !Array.isArray(characterBook)
      ? (() => {
          const bookValue = characterBook as Record<string, unknown>;
          return {
            ...bookValue,
            scanDepth: bookValue.scanDepth ?? bookValue.scan_depth,
            entries: Array.isArray(bookValue.entries)
              ? bookValue.entries.map((entry: unknown) => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
                  const item = entry as Record<string, unknown>;
                  return {
                    ...item,
                    secondaryKeys: item.secondaryKeys ?? item.secondary_keys,
                    insertionOrder: item.insertionOrder ?? item.insertion_order,
                  };
                })
              : bookValue.entries,
          };
        })()
      : characterBook;
  return validateXumengCharacterInput({
    ...source,
    author: source.author ?? source.creator,
    creatorNotes: source.creatorNotes ?? source.creator_notes,
    characterVersion: source.characterVersion ?? source.character_version,
    firstMessage: source.firstMessage ?? source.first_mes,
    alternateGreetings: source.alternateGreetings ?? source.alternate_greetings,
    systemPrompt: source.systemPrompt ?? source.system_prompt,
    postHistoryInstructions: source.postHistoryInstructions ?? source.post_history_instructions,
    messageExamples: source.messageExamples ?? source.mes_example,
    characterBook: book,
  });
}

export function validateXumengChatRequest(value: unknown): XumengChatRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('对话请求格式无效');
  const row = value as Record<string, unknown>;
  const characterId = typeof row.characterId === 'string' ? row.characterId.trim() : '';
  const character =
    row.character && typeof row.character === 'object' && !Array.isArray(row.character)
      ? validateXumengCharacterInput(row.character)
      : undefined;
  if (!CHARACTER_ID.test(characterId) && !character) throw new Error('角色编号或角色卡无效');
  if (!Array.isArray(row.messages) || row.messages.length < 1 || row.messages.length > 60)
    throw new Error('消息数量无效');
  const messages = row.messages.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('消息格式无效');
    const message = item as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(message.role))) throw new Error('消息角色无效');
    return {
      ...(typeof message.id === 'string' ? { id: message.id } : {}),
      role: message.role as XumengMessage['role'],
      content: text(message.content, '消息内容', 12_000),
      ...(typeof message.createdAt === 'string' ? { createdAt: message.createdAt } : {}),
      ...(message.metadata &&
      typeof message.metadata === 'object' &&
      !Array.isArray(message.metadata)
        ? { metadata: message.metadata as Record<string, unknown> }
        : {}),
    } satisfies XumengMessage;
  });
  if (messages[messages.length - 1]?.role !== 'user') throw new Error('最后一条消息应为用户消息');
  if (
    row.sessionId !== undefined &&
    (typeof row.sessionId !== 'string' || !CHARACTER_ID.test(row.sessionId))
  )
    throw new Error('会话编号无效');
  if (
    row.model !== undefined &&
    (typeof row.model !== 'string' || row.model.trim().length === 0 || row.model.length > 200)
  )
    throw new Error('模型名称无效');
  if (
    row.temperature !== undefined &&
    (typeof row.temperature !== 'number' ||
      !Number.isFinite(row.temperature) ||
      row.temperature < 0 ||
      row.temperature > 2)
  )
    throw new Error('温度参数无效');
  if (
    row.maxTokens !== undefined &&
    (typeof row.maxTokens !== 'number' ||
      !Number.isInteger(row.maxTokens) ||
      row.maxTokens < 128 ||
      row.maxTokens > 4096)
  )
    throw new Error('输出长度无效');
  const state = validateState(row.state);
  if (row.memory !== undefined && (!Array.isArray(row.memory) || row.memory.length > 24))
    throw new Error('记忆数量无效');
  const memory = row.memory?.map((item) => text(item, '记忆', 4_000));
  const metadata =
    row.metadata === undefined
      ? undefined
      : !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)
        ? (() => {
            throw new Error('元数据格式无效');
          })()
        : (row.metadata as Record<string, unknown>);
  const result: XumengChatRequest = {
    ...(CHARACTER_ID.test(characterId) ? { characterId } : {}),
    ...(character ? { character } : {}),
    ...(row.sessionId === undefined ? {} : { sessionId: row.sessionId as string }),
    messages,
    ...(state ? { state } : {}),
    ...(memory ? { memory } : {}),
    ...(row.model === undefined ? {} : { model: row.model.trim() }),
    ...(row.temperature === undefined ? {} : { temperature: row.temperature }),
    ...(row.maxTokens === undefined ? {} : { maxTokens: row.maxTokens }),
    ...(metadata ? { metadata } : {}),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (bytes > 180_000) throw new Error('聊天上下文过长');
  return result;
}

export function xumengCharacterPrompt(character: XumengCharacterInput) {
  const input = validateXumengCharacterInput(character);
  return {
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.personality ? { personality: input.personality } : {}),
    ...(input.scenario ? { scenario: input.scenario } : {}),
    ...(input.firstMessage ? { firstMessage: input.firstMessage } : {}),
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.postHistoryInstructions
      ? { postHistoryInstructions: input.postHistoryInstructions }
      : {}),
    ...(input.messageExamples ? { messageExamples: input.messageExamples } : {}),
    ...(input.characterBook ? { characterBook: input.characterBook } : {}),
  };
}

export function createXumengAgentApi() {
  return {
    health: (): Promise<XumengHealth> => api.xumeng.health(),
    characters: {
      list: (query?: string, signal?: AbortSignal): Promise<Page<XumengCharacter>> =>
        api.xumeng.characters.list(query ? { query } : undefined, { signal }),
      get: (id: Id): Promise<XumengCharacter> => api.xumeng.characters.get(id),
      create: (input: XumengCharacterInput): Promise<XumengCharacter> =>
        api.xumeng.characters.create(validateXumengCharacterInput(input)),
      update: (id: Id, input: Partial<XumengCharacterInput>): Promise<XumengCharacter> =>
        api.xumeng.characters.update(id, input),
      remove: (id: Id): Promise<void> => api.xumeng.characters.remove(id),
    },
    sessions: {
      list: (characterId?: Id, signal?: AbortSignal): Promise<Page<XumengSession>> =>
        api.xumeng.sessions.list(characterId ? { characterId } : undefined, { signal }),
      get: (id: Id): Promise<XumengSession> => api.xumeng.sessions.get(id),
      create: (input: XumengSessionInput): Promise<XumengSession> =>
        api.xumeng.sessions.create(input),
      remove: (id: Id): Promise<void> => api.xumeng.sessions.remove(id),
    },
    chat: (request: XumengChatRequest, signal?: AbortSignal): Promise<XumengChatResponse> =>
      api.xumeng.chat(validateXumengChatRequest(request), { signal }),
    chatStream: async (
      request: XumengChatRequest,
      onDelta: (delta: string) => void,
      signal?: AbortSignal,
      onEvent?: (event: XumengStreamEvent) => void,
    ): Promise<void> => {
      const response = await api.xumeng.chatStream(validateXumengChatRequest(request), { signal });
      await readXumengStream(response, onDelta, signal, onEvent);
    },
    memory: (body: unknown, signal?: AbortSignal) => api.xumeng.memory(body, { signal }),
    importCard: (body: unknown) => api.xumeng.importCard(normalizeXumengCard(body)),
    exportCard: (id: Id) => api.xumeng.exportCard(id),
  };
}

export async function readXumengStream(
  response: Response,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  onEvent?: (event: XumengStreamEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('叙梦服务没有返回内容');
  const contentType = response.headers.get('content-type') || '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const emit = (data: string) => {
    if (!data || data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      const nested = parsed.content as Record<string, unknown> | undefined;
      const delta =
        typeof parsed.delta === 'string'
          ? parsed.delta
          : typeof parsed.text === 'string'
            ? parsed.text
            : typeof nested?.text === 'string'
              ? nested.text
              : '';
      if (delta) onDelta(delta);
      const statePatch =
        parsed.statePatch &&
        typeof parsed.statePatch === 'object' &&
        !Array.isArray(parsed.statePatch)
          ? Object.fromEntries(
              Object.entries(parsed.statePatch).filter(
                ([, value]) =>
                  value === null || ['string', 'number', 'boolean'].includes(typeof value),
              ),
            )
          : undefined;
      const memoryAppend = Array.isArray(parsed.memoryAppend)
        ? parsed.memoryAppend.filter((value): value is string => typeof value === 'string')
        : undefined;
      if (statePatch || memoryAppend?.length)
        onEvent?.({
          ...(delta ? { delta } : {}),
          ...(statePatch ? { statePatch } : {}),
          ...(memoryAppend?.length ? { memoryAppend } : {}),
        });
    } catch {
      onDelta(data);
    }
  };
  try {
    for (;;) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      const decoded = decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      buffer += decoded;
      if (contentType.includes('text/event-stream')) {
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const event of events) {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data || data === '[DONE]') continue;
          emit(data);
        }
      } else if (decoded) {
        onDelta(decoded);
      }
      if (chunk.done) break;
    }
    if (contentType.includes('text/event-stream') && buffer.trim()) {
      const data = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      emit(data);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function xumengErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) {
    const details = error.details as ApiErrorBody | null;
    return details?.message || error.message;
  }
  return error instanceof Error ? error.message : '叙梦 Agent 暂时不可用，请稍后重试';
}
