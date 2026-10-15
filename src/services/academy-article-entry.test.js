import { describe, expect, it } from 'vitest';
import { academyArticleCanvasUrl } from './academy-article-entry.js';

describe('academy article canvas entry', () => {
  it('preserves the share query while adding source attribution and tutorial key', () => {
    expect(
      academyArticleCanvasUrl(
        'https://www.liblib.tv/canvas/share?spaceId=100&projectId=project&isTutorial=true#node',
        'article-1',
      ),
    ).toBe(
      'https://www.liblib.tv/canvas/share?spaceId=100&projectId=project&isTutorial=true&source=academy_tutorial&itemKey=article-1#node',
    );
  });

  it('keeps relative local fixtures relative and safely handles empty or malformed input', () => {
    expect(academyArticleCanvasUrl('/canvas/share?projectId=local', 'article-2')).toBe(
      '/canvas/share?projectId=local&source=academy_tutorial&itemKey=article-2',
    );
    expect(academyArticleCanvasUrl('', 'article-2')).toBe('');
    expect(academyArticleCanvasUrl('not a url', 'article-2')).toBe('not a url');
  });
});
