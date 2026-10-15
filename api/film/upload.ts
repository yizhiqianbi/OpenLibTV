import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { checkFilmMethod, filmHttp, readFilmBody, type FilmRequest } from '../_lib/film-http.js';
import { filmPublisher } from '../_lib/film-publish.js';
import type { ServerResponse } from 'node:http';
export default async function handler(request: FilmRequest, response: ServerResponse) {
  return filmHttp(response, async () => {
    checkFilmMethod(request, 'POST');
    const body = await readFilmBody(request);
    return handleUpload({
      request,
      body: body as unknown as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, payload) =>
        filmPublisher().uploadConstraints(payload, pathname),
      // The SDK authenticates Blob callbacks. Completion is determined by HEAD, never a browser callback.
      onUploadCompleted: async () => {},
    });
  });
}
