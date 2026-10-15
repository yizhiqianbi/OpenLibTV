import { checkFilmMethod, filmHttp, readFilmBody, type FilmRequest } from '../_lib/film-http.js';
import { filmPublisher } from '../_lib/film-publish.js';
import type { ServerResponse } from 'node:http';
export default async function handler(request: FilmRequest, response: ServerResponse) {
  return filmHttp(response, async () => {
    checkFilmMethod(request, 'POST');
    const body = await readFilmBody(request);
    return filmPublisher().start(body.password, body.manifest, body.resumeToken);
  });
}
