import { describe, expect, it } from 'vitest';
import {
  buildScriptV2Csv,
  escapeScriptCsvCell,
  SCRIPT_CSV_TYPE,
  scriptCsvFileName,
} from './export-csv.js';

describe('ScriptV2 source CSV export', () => {
  it('returns a UTF-8 BOM descriptor with source field order, dynamic character triples and an asset section', () => {
    const exported = buildScriptV2Csv({
      title: '电影草稿',
      rows: [
        {
          shotNumber: 1,
          durationSeconds: 5,
          plotDescription: '空镜',
          characters: [
            { characterName: '甲', characterDescription: '外套', characterImageUrl: '/a.jpg' },
          ],
          videoReference: { referenceFrameImage: '/frame.jpg' },
          shotSize: '远景',
          emotion: '不导出',
          propTags: '不导出',
          lightingAndAtmosphere: '晴',
          audioEffects: '风',
          dialogue: '你好',
          imageGenerationPrompt: '图片',
          videoMotionPrompt: '推镜',
        },
        {
          shotNumber: 2,
          durationSeconds: 6,
          plotDescription: '角色入场',
          characters: [{ characterName: '乙' }, { characterName: '丙' }],
        },
      ],
      assets: {
        characters: [{ name: '甲', thumbnailUrl: '/a.jpg', description: '外套' }],
        scenes: [{ name: '街道', description: '白天' }],
        props: [{ name: '伞', thumbnailUrl: '/umbrella.jpg' }],
      },
    });
    expect(exported).toEqual({
      name: '电影草稿.csv',
      type: SCRIPT_CSV_TYPE,
      content:
        '\uFEFF镜号,时长,画面描述,角色1,角色描述1,角色图1,角色2,角色描述2,角色图2,视频参考图,景别,光影氛围,音效,对白,分镜提示词,视频提示词\n' +
        '1,5,空镜,甲,外套,/a.jpg,,,,/frame.jpg,远景,晴,风,你好,图片,推镜\n' +
        '2,6,角色入场,乙,,,丙,,,,,,,,,\n\n' +
        '类型,名称,图片,描述提示词\n角色,甲,/a.jpg,外套\n场景,街道,,白天\n道具,伞,/umbrella.jpg,',
    });
  });

  it('escapes commas, quotes, CR and LF while preserving formula-like and Unicode source text', () => {
    expect(escapeScriptCsvCell('逗号,"引号"\r\n换行')).toBe('"逗号,""引号""\r\n换行"');
    expect(escapeScriptCsvCell('=原文')).toBe('=原文');
    const result = buildScriptV2Csv({
      rows: [{ plotDescription: '第1行\n第2行', dialogue: '“你好”' }],
      assets: {},
    });
    expect(result.content).toContain(
      '\n,,"第1行\n第2行",,,,,“你好”,,\n\n类型,名称,图片,描述提示词',
    );
    expect(result.content.endsWith('\n')).toBe(false);
  });

  it('uses API field labels, including explicit empty labels, and omits structured fields from scalar columns', () => {
    const result = buildScriptV2Csv({
      rows: [
        {
          shotNumber: 0,
          durationSeconds: 2.5,
          dialogue: { text: '不能序列化对象' },
          dialogueLines: [{ text: '结构化正文不在该CSV字段中' }],
          videoReference: { referenceFrameImage: '/exact.png', other: '忽略' },
          cinematics: { cameraMovement: '不新增运镜列' },
        },
      ],
      shotColumns: [
        { field: 'shot_number', label: '编号' },
        { field: 'duration_seconds', label: '' },
        { field: 'plotDescription', label: '错误映射' },
      ],
    });
    expect(result.content).toBe(
      '\uFEFF编号,,画面描述,视频参考图,景别,光影氛围,音效,对白,分镜提示词,视频提示词\n0,2.5,,/exact.png,,,,,,\n\n类型,名称,图片,描述提示词',
    );
  });

  it('exports named raw asset thumbnails without guessing URLs from linked canvas nodes', () => {
    const result = buildScriptV2Csv({
      rows: [{}],
      assets: {
        characters: [
          { name: '', thumbnailUrl: '/unnamed.png' },
          { name: '已链接', linkedNodeId: 'node' },
        ],
        scenes: [{ name: '山,"雪"', thumbnailUrl: '/mountain.png', description: '寒冷\r清晨' }],
      },
    });
    expect(result.content).toContain(
      '类型,名称,图片,描述提示词\n角色,已链接,,\n场景,"山,""雪""",/mountain.png,"寒冷\r清晨"',
    );
    expect(result.content).not.toContain('/unnamed.png');
  });

  it('cleans names exactly once and keeps label precedence without creating browser objects', () => {
    expect(scriptCsvFileName(' \t电影<>:"/\\|?*\u0000.csv\n ')).toBe('_电影__________.csv_.csv');
    expect(scriptCsvFileName('   ')).toBe('file.csv');
    const snapshot = Object.freeze({
      rows: Object.freeze([Object.freeze({})]),
      title: '标题',
      name: '名称',
      label: '标签',
    });
    expect(buildScriptV2Csv(snapshot).name).toBe('标题.csv');
    expect(buildScriptV2Csv(snapshot, { name: '自定义' }).name).toBe('自定义.csv');
    expect(buildScriptV2Csv({ rows: [{}] }).name).toBe('脚本.csv');
    expect(buildScriptV2Csv({ rows: [] })).toBeNull();
    expect(buildScriptV2Csv(null)).toBeNull();
  });
});
