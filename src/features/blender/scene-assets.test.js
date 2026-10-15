// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLENDER_ASSETS } from './scene-config.js';

const publicDirectory = new URL('../../../public/', import.meta.url);
const assetMap = JSON.parse(readFileSync(new URL('data/asset-map.json', publicDirectory), 'utf8'));

describe('Blender platform assets', () => {
  it.each(['platformMac', 'platformWindows'])('%s resolves to an existing local SVG', (name) => {
    const localPath = assetMap[BLENDER_ASSETS[name]];
    expect(localPath).toMatch(/^\/assets\/[^/]+\.svg$/);
    const svg = readFileSync(new URL(localPath.slice(1), publicDirectory), 'utf8');
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).not.toMatch(/<!doctype html>/i);
  });
});
