import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import secondary from '../../../../public/data/secondary.json';
import SkillCreatePage from './SkillCreatePage.jsx';

vi.mock('../../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: secondary, loading: false, error: null, reload: vi.fn() }),
}));

const actions = () => ({
  login: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  asset: (value) => value,
  user: { name: '本地测试' },
});

function fileReader(result = 'data:image/png;base64,local') {
  class Reader {
    static instances = [];
    result = null;
    onload = null;
    onerror = null;
    abort = vi.fn();
    readAsDataURL(file) {
      this.file = file;
      Reader.instances.push(this);
    }
  }
  Reader.resultValue = result;
  return Reader;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/skill/create');
});

describe('Skill cover upload boundary', () => {
  it('keeps save disabled while an injected cover upload is pending and stores its returned URL', async () => {
    let resolve;
    const upload = vi.fn(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const Reader = fileReader();
    vi.stubGlobal('FileReader', Reader);
    const props = actions();
    render(<SkillCreatePage {...props} coverSource={{ upload }} />);
    fireEvent.change(screen.getByLabelText('上传封面'), {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('button', { name: secondary.commonLocale.save }).disabled).toBe(true);
    const reader = Reader.instances[0];
    reader.result = Reader.resultValue;
    act(() => {
      void reader.onload();
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ dataUrl: Reader.resultValue, file: expect.any(File) }),
    );
    resolve({ url: 'https://cdn.example.test/cover.png' });
    await waitFor(() =>
      expect(screen.getByAltText('cover').getAttribute('src')).toContain('cdn.example.test'),
    );
    expect(screen.getByRole('button', { name: secondary.commonLocale.save }).disabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it('keeps the previous cover and exposes a retry toast when upload fails', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('offline'));
    const Reader = fileReader('data:image/png;base64,new');
    vi.stubGlobal('FileReader', Reader);
    const props = actions();
    render(<SkillCreatePage {...props} coverSource={{ upload }} />);
    fireEvent.change(screen.getByLabelText('上传封面'), {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    });
    const reader = Reader.instances[0];
    reader.result = Reader.resultValue;
    await act(async () => reader.onload());
    await waitFor(() => expect(props.toast).toHaveBeenCalledWith('上传失败，请重试'));
    expect(screen.queryByAltText('cover')).toBeNull();
    vi.unstubAllGlobals();
  });
});
