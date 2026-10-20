import React, { useMemo } from 'react';
import { parseFrontmatter } from './frontmatter.js';

function safeUrl(url) {
  return /^(?:https?:\/\/|\/|#|mailto:)/i.test(url || '') ? url : '#';
}

function inlineMarkdown(text, asset) {
  const expression =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*/g;
  const children = [];
  let previous = 0,
    match;
  while ((match = expression.exec(text))) {
    if (match.index > previous) children.push(text.slice(previous, match.index));
    const key = match.index;
    if (match[1] !== undefined)
      children.push(<img key={key} src={asset(safeUrl(match[2]))} alt={match[1]} loading="lazy" />);
    else if (match[3] !== undefined)
      children.push(
        <a
          key={key}
          href={safeUrl(match[4])}
          target={match[4].startsWith('#') ? undefined : '_blank'}
          rel="noreferrer"
        >
          {inlineMarkdown(match[3], asset)}
        </a>,
      );
    else if (match[5] !== undefined) children.push(<code key={key}>{match[5]}</code>);
    else if (match[6] !== undefined || match[7] !== undefined)
      children.push(<strong key={key}>{inlineMarkdown(match[6] || match[7], asset)}</strong>);
    else if (match[8] !== undefined) children.push(<del key={key}>{match[8]}</del>);
    else children.push(<em key={key}>{match[9]}</em>);
    previous = expression.lastIndex;
  }
  if (previous < text.length) children.push(text.slice(previous));
  return children;
}

function Markdown({ content = '', asset }) {
  const parsed = useMemo(() => parseFrontmatter(content), [content]);
  const blocks = useMemo(() => {
    const lines = parsed.body.replace(/\r\n/g, '\n').split('\n'),
      out = [];
    let section = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || /^<\/?p\b[^>]*>$/i.test(line)) continue;
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const Tag = `h${heading[1].length}`;
        out.push(
          <Tag id={Tag === 'h2' ? `academy-article-section-${section++}` : undefined} key={i}>
            {inlineMarkdown(heading[2], asset)}
          </Tag>,
        );
        continue;
      }
      if (/^[-*_]{3,}$/.test(line)) {
        out.push(<hr key={i} />);
        continue;
      }
      if (line.startsWith('```')) {
        const code = [];
        while (i + 1 < lines.length && !lines[i + 1].trim().startsWith('```'))
          code.push(lines[++i]);
        i++;
        out.push(
          <pre key={i}>
            <code>{code.join('\n')}</code>
          </pre>,
        );
        continue;
      }
      if (line.startsWith('>')) {
        const quote = [line.replace(/^>\s?/, '')];
        while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>'))
          quote.push(lines[++i].trim().replace(/^>\s?/, ''));
        out.push(
          <blockquote key={i}>
            <Markdown content={quote.join('\n')} asset={asset} />
          </blockquote>,
        );
        continue;
      }
      if (/^<img\b|^<video\b/i.test(line)) {
        const source = line.match(/src=["']([^"']+)["']/)?.[1],
          width = line.match(/width=["']([^"']+)["']/)?.[1],
          video = line.startsWith('<video');
        if (source)
          out.push(
            <p className="markdown-media" key={i}>
              {video ? (
                <video
                  controls
                  preload="metadata"
                  src={asset(safeUrl(source))}
                  style={{ width: width || '100%' }}
                />
              ) : (
                <img
                  src={asset(safeUrl(source))}
                  alt=""
                  loading="lazy"
                  style={{ width: width || '100%' }}
                />
              )}
            </p>,
          );
        continue;
      }
      const list = line.match(/^([-+*]|\d+\.)\s+(.+)$/);
      if (list) {
        const ordered = /\d/.test(list[1]),
          items = [list[2]];
        while (i + 1 < lines.length && /^\s*([-+*]|\d+\.)\s+/.test(lines[i + 1]))
          items.push(lines[++i].trim().replace(/^([-+*]|\d+\.)\s+/, ''));
        const Tag = ordered ? 'ol' : 'ul';
        out.push(
          <Tag key={i}>
            {items.map((item, j) => (
              <li key={j}>{inlineMarkdown(item, asset)}</li>
            ))}
          </Tag>,
        );
        continue;
      }
      if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
        const cells = (s) =>
            s
              .replace(/^\s*\||\|\s*$/g, '')
              .split('|')
              .map((c) => c.trim()),
          head = cells(line),
          rows = [];
        i++;
        while (i + 1 < lines.length && lines[i + 1].includes('|')) rows.push(cells(lines[++i]));
        out.push(
          <div className="markdown-table" key={i}>
            <table>
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>{inlineMarkdown(c, asset)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{inlineMarkdown(c, asset)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
      const paragraph = [line];
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim() &&
        !/^(?:#|>|[-+*]\s|\d+\.\s|<|```)/.test(lines[i + 1].trim())
      )
        paragraph.push(lines[++i].trim());
      out.push(
        <p key={i}>
          {paragraph.map((s, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {inlineMarkdown(
                s.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?(?:p|div|span)[^>]*>/gi, ''),
                asset,
              )}
            </React.Fragment>
          ))}
        </p>,
      );
    }
    return out;
  }, [parsed.body, asset]);
  return (
    <div className="secondary-markdown markdown-content">
      {parsed.data.length > 0 && (
        <table className="markdown-frontmatter">
          <thead>
            <tr>
              <th colSpan="2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {parsed.data.map(({ key, value }) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {blocks}
    </div>
  );
}

export default Markdown;
