// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import process from 'node:process';
import architecture from '../../scripts/architecture-rules.mjs';

function check(filename, code) {
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{js,jsx}'],
        plugins: { architecture },
        rules: { 'architecture/import-boundaries': 'error' },
      },
    ],
    { filename: `${process.cwd()}/src/${filename}` },
  );
}

describe('architecture import boundaries', () => {
  it('rejects reverse UI and feature dependencies from shared layers', () => {
    const cases = [
      ['services/example.js', "import x from '../components/Icon.jsx'"],
      ['services/example.js', "import { useState } from 'react'"],
      ['services/example.js', "import { useContent } from '../data.js'"],
      ['components/example.jsx', "import { useContent } from '../data.js'"],
      ['hooks/example.js', "import x from '../features/skills/SkillPage.jsx'"],
      ['components/example.jsx', "import x from '../features/skills/domain/handoff.js'"],
      ['features/skills/example.js', "import x from '../../app/useAppUI.js'"],
    ];
    for (const [file, code] of cases) {
      const messages = check(file, code);
      expect(messages).toHaveLength(1);
      expect(messages[0].ruleId).toBe('architecture/import-boundaries');
      expect(messages[0].severity).toBe(2);
    }
  });

  it('allows explicit cross-domain entries and rejects internal static, lazy and re-exports', () => {
    const filename = 'features/assets/domain/example.js';
    expect(check(filename, "import x from '../../canvas/document-api.js'")).toEqual([]);
    expect(check(filename, "import x from '../../canvas/document-api'")).toEqual([]);
    expect(check(filename, "import x from '../../canvas/model.js'")).toHaveLength(1);
    expect(
      check(filename, "const load = () => import('../../canvas/hooks/useCanvasDocument.js')"),
    ).toHaveLength(1);
    expect(
      check(filename, 'const load = () => import(`../../canvas/hooks/useCanvasDocument.js`)'),
    ).toHaveLength(1);
    expect(check(filename, "export { x } from '../../canvas/persistence.js'")).toHaveLength(1);
    expect(check(filename, "import x from '../../editor/model.js'")).toEqual([]);
  });

  it('keeps exact legacy exports usable without exempting new implementations', () => {
    expect(
      check(
        'components/Gallery.jsx',
        "export { default } from '../features/gallery/components/Gallery.jsx'",
      ),
    ).toEqual([]);
    expect(
      check(
        'components/Gallery.jsx',
        "import Gallery from '../features/gallery/components/Gallery.jsx'",
      ),
    ).toHaveLength(1);
    expect(
      check('components/Gallery.jsx', "export { default } from '../features/skills/SkillPage.jsx'"),
    ).toHaveLength(1);
    expect(
      check(
        'features/shared/secondary/CoursePlayer.jsx',
        "export { default } from '../../academy/player/CoursePlayer.jsx'",
      ),
    ).toEqual([]);
  });

  it('allows integration tests and preserves stylesheet loading order', () => {
    expect(
      check('hooks/example.test.js', "import x from '../features/canvas/CanvasPage.jsx'"),
    ).toEqual([]);
    expect(check('features/studio/example.js', "import '../canvas/canvas.css'")).toEqual([]);
  });

  it('keeps domain rules and conventional models independent of views and hooks', () => {
    const cases = [
      ['features/canvas/domain/commands.js', "import { useState } from 'react'"],
      ['features/canvas/model.js', "import x from './hooks/useCanvasDocument.js'"],
      ['features/studio/camera/model.js', "import x from './CameraMotionPanel.jsx'"],
      ['features/canvas/generator/media-input-model.js', "import x from './useNodeGenerator'"],
      [
        'features/canvas/generator/schema.js',
        "const load = () => import('./NodeGeneratorPrompt.jsx')",
      ],
      ['features/gallery/domain/filter.js', "export { x } from '../../canvas/CanvasPage'"],
      ['features/academy/course/marketing-model.js', "import './marketing.css'"],
      ['services/example.js', "import x from '@mantine/core'"],
    ];
    for (const [filename, code] of cases) expect(check(filename, code)).toHaveLength(1);
    expect(check('features/canvas/model.js', "import x from './generator/schema.js'")).toEqual([]);
    expect(
      check(
        'features/assets/domain/canvas-export.js',
        "import x from '../../canvas/document-api.js'",
      ),
    ).toEqual([]);
    expect(check('features/studio/camera/model.js', "import * as THREE from 'three'")).toEqual([]);
    expect(
      check('features/canvas/hooks/useCanvasNodeActions.js', "import { useRef } from 'react'"),
    ).toEqual([]);
  });
});
