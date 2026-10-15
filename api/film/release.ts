import { checkFilmMethod, filmHttp, type FilmRequest } from '../_lib/film-http.js';
import { filmPublisher } from '../_lib/film-publish.js';
import type { ServerResponse } from 'node:http';
export default async function handler(request: FilmRequest, response: ServerResponse) {
  return filmHttp(
    response,
    async () => {
      checkFilmMethod(request, 'GET');
      const id =
        request.query?.releaseId ??
        new URL(request.url || '/', 'https://localhost').searchParams.get('releaseId');
      return filmPublisher().release(id);
    },
    true,
  );
}
