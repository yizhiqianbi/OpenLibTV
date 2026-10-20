import type { ServerResponse } from 'node:http';
import { handleXumengProxy, type XumengRequest } from '../_lib/xumeng-proxy.js';

export default async function handler(request: XumengRequest, response: ServerResponse) {
  await handleXumengProxy(request, response);
}
