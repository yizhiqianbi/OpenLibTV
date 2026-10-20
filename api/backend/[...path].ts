import type { ServerResponse } from 'node:http';
import { handleLibTvProxy, type LibTvRequest } from '../_lib/libtv-proxy.js';

export default async function handler(request: LibTvRequest, response: ServerResponse) {
  await handleLibTvProxy(request, response);
}
