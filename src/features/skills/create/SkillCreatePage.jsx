import { withSecondaryData } from '../../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Upload } from 'lucide-react';
import SkillField from './components/SkillField.jsx';
import SkillFileEditor from './components/SkillFileEditor.jsx';
import { skillFields, skillInitial, readLocalSkills, skillFileLimit } from './skill-form.js';
import { writeStoredValue } from '../../../services/storage.ts';
import { template } from '../../shared/secondary/text.js';

function SkillCreate({ data, login, user, navigate, toast, asset, coverSource }) {
  const t = data.commonLocale,
    uuid = new URLSearchParams(location.search).get('skillUuid'),
    initialState = useMemo(() => {
      try {
        return { draft: readLocalSkills().find((s) => s.skillUuid === uuid), error: null };
      } catch (error) {
        return { draft: null, error };
      }
    }, [uuid]),
    initial = initialState.draft;
  const [form, setForm] = useState(() =>
      initial
        ? {
            ...skillInitial,
            ...initial,
            ...Object.fromEntries(skillFields.map(([name]) => [name, initial[name] ?? ''])),
          }
        : skillInitial,
    ),
    [files, setFiles] = useState(() =>
      initial?.skillFiles?.length
        ? initial.skillFiles
        : [
            {
              path: 'SKILL.md',
              content: initial?.markdownContent || '',
              contentType: 'text/markdown',
              primary: true,
            },
          ],
    ),
    [dirs, setDirs] = useState(() =>
      Array.isArray(initial?.skillDirectories) ? initial.skillDirectories : [],
    ),
    [selected, setSelected] = useState('SKILL.md'),
    [mode, setMode] = useState('preview'),
    [errors, setErrors] = useState({}),
    [saving, setSaving] = useState(false),
    [typeOpen, setTypeOpen] = useState(false),
    [uploadingFiles, setUploadingFiles] = useState(false),
    [uploadingCover, setUploadingCover] = useState(false);
  const prompted = useRef(false),
    cover = useRef(null),
    coverReader = useRef(null),
    typeTrigger = useRef(null),
    alive = useRef(true);
  const resultTypeOptions = [
    [2, t.skillTypeImage],
    [3, t.skillTypeVideo],
    [4, t.skillTypeAudio],
    [1, t.skillTypeText],
  ];
  const [typeIndex, setTypeIndex] = useState(() =>
    Math.max(
      0,
      resultTypeOptions.findIndex(([value]) => value === form.resultType),
    ),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      coverReader.current?.abort();
      coverReader.current = null;
    };
  }, []);
  useEffect(() => {
    if (!typeOpen) return undefined;
    const dismiss = (event) => {
      if (!event.target.closest('.secondary-skill-type')) setTypeOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [typeOpen]);
  useEffect(() => {
    if (!user && !prompted.current) {
      prompted.current = true;
      login({ closeOnClickOutside: false });
    }
  }, [user, login]);
  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }
  function changeFiles(next) {
    setFiles(next);
    setErrors((previous) => ({ ...previous, markdownContent: undefined }));
  }
  function save() {
    if (saving || uploadingFiles || uploadingCover) return;
    const err = {};
    for (const [name] of skillFields)
      if (!form[name].trim())
        err[name] =
          t[
            {
              name: 'createSkillNameRequired',
              description: 'createSkillDescriptionRequired',
              useScenario: 'createSkillErrUseScenario',
              inputType: 'createSkillErrHowToUse',
              outputContent: 'createSkillErrOutput',
            }[name]
          ];
    if (!files.some((f) => f.path === 'SKILL.md'))
      err.markdownContent = t.createSkillFolderPrimaryRequired;
    else if (files.some((f) => !f.content.trim()))
      err.markdownContent = t.createSkillFolderFileEmpty;
    else if (files.some((f) => f.content.length > 20000))
      err.markdownContent = template(t.createSkillFolderFileMaxLength, { max: 20000 });
    if (skillFileLimit(files)) err.markdownContent = '文件数量或总大小超出限制，请检查后重试';
    setErrors(err);
    if (Object.keys(err).length) {
      toast?.(t.createSkillFillRequired);
      return;
    }
    setSaving(true);
    try {
      const skillUuid = uuid || crypto.randomUUID().replaceAll('-', ''),
        draft = {
          ...form,
          skillUuid,
          skillFiles: files,
          skillDirectories: dirs,
          markdownContent: files.find((f) => f.path === 'SKILL.md').content,
          showMarkdown: true,
          namespace: 'local',
          skillKey: form.name,
          ownerName: user.name || user.nickname || '本地用户',
          createdAt: Date.now(),
          localDemo: true,
        };
      writeStoredValue('libtv-created-skills', [
        draft,
        ...readLocalSkills().filter((s) => s.skillUuid !== skillUuid),
      ]);
      toast?.('Skill 草稿已保存到本地演示');
      navigate('/skill?tab=mine');
    } catch {
      toast?.('本地保存失败，请检查浏览器存储空间');
    } finally {
      setSaving(false);
    }
  }
  async function uploadCover(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 10485760) {
      toast?.(template(t.createSkillFileSizeLimit, { kind: '图片', limit: 10 }));
      return;
    }
    const reader = new FileReader();
    coverReader.current?.abort();
    coverReader.current = reader;
    setUploadingCover(true);
    const finish = (failed, value = reader.result) => {
      if (!alive.current || coverReader.current !== reader) return;
      coverReader.current = null;
      setUploadingCover(false);
      if (failed) toast?.(t.createSkillUploadFailedRetry);
      else if (typeof value === 'string' && value) setField('coverUrl', value);
    };
    reader.onload = async () => {
      if (!alive.current || coverReader.current !== reader) return;
      try {
        const dataUrl = reader.result,
          uploaded = coverSource?.upload ? await coverSource.upload({ file: f, dataUrl }) : dataUrl,
          remoteUrl =
            typeof uploaded === 'string'
              ? uploaded
              : typeof uploaded?.url === 'string'
                ? uploaded.url
                : dataUrl;
        finish(false, remoteUrl);
      } catch {
        finish(true);
      }
    };
    reader.onerror = () => finish(true);
    try {
      reader.readAsDataURL(f);
    } catch {
      finish(true);
    }
  }
  function selectResultType(value) {
    setField('resultType', value);
    if (value === 1 || value === 4) setField('coverUrl', '');
    setTypeOpen(false);
    typeTrigger.current?.focus({ preventScroll: true });
  }
  function onResultTypeKeyDown(event) {
    if (event.key === 'Escape') {
      if (typeOpen) {
        event.preventDefault();
        setTypeOpen(false);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (typeOpen) selectResultType(resultTypeOptions[typeIndex][0]);
      else {
        setTypeIndex(
          Math.max(
            0,
            resultTypeOptions.findIndex(([value]) => value === form.resultType),
          ),
        );
        setTypeOpen(true);
      }
      return;
    }
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    if (!typeOpen) setTypeOpen(true);
    setTypeIndex((index) => {
      if (event.key === 'Home') return 0;
      if (event.key === 'End') return resultTypeOptions.length - 1;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      return (index + delta + resultTypeOptions.length) % resultTypeOptions.length;
    });
  }
  if (!user) return <div className="secondary-skill-create" />;
  if (initialState.error)
    return (
      <div className="secondary-skill-create">
        <p className="secondary-skill-private-error" role="alert">
          本地草稿读取失败，原数据未覆盖。
        </p>
        <button className="soft-button" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  if (uuid && !initial)
    return (
      <div className="secondary-skill-create">
        <p className="secondary-skill-private-error">{t.createSkillFetchDetailFailed}</p>
      </div>
    );
  return (
    <main className="secondary-skill-create">
      <header>
        <span>{uuid ? t.createSkillUpdateTitle : t.createSkillCreateTitle}</span>
        <button disabled={saving || uploadingFiles || uploadingCover} onClick={save}>
          {saving ? t.createSkillSaving : t.save}
        </button>
      </header>
      <div className="secondary-skill-form">
        <SkillField
          field={skillFields[0]}
          form={form}
          setField={setField}
          error={errors.name}
          t={t}
        />
        <SkillField
          field={skillFields[1]}
          form={form}
          setField={setField}
          error={errors.description}
          t={t}
        />
        <SkillFileEditor
          onUploadBusyChange={setUploadingFiles}
          files={files}
          setFiles={changeFiles}
          dirs={dirs}
          setDirs={setDirs}
          selected={selected}
          setSelected={setSelected}
          mode={mode}
          setMode={setMode}
          t={t}
          error={errors.markdownContent}
          toast={toast}
          asset={asset}
        />
        {skillFields.slice(2).map((field) => (
          <SkillField
            key={field[0]}
            field={field}
            form={form}
            setField={setField}
            error={errors[field[0]]}
            t={t}
          />
        ))}
        <div className="secondary-skill-type">
          <span>{t.createSkillFieldResultType}</span>
          <button
            type="button"
            ref={typeTrigger}
            aria-haspopup="listbox"
            aria-expanded={typeOpen}
            aria-controls="secondary-skill-result-types"
            onClick={() => {
              setTypeIndex(
                Math.max(
                  0,
                  resultTypeOptions.findIndex(([value]) => value === form.resultType),
                ),
              );
              setTypeOpen((v) => !v);
            }}
            onKeyDown={onResultTypeKeyDown}
          >
            {
              { 2: t.skillTypeImage, 3: t.skillTypeVideo, 4: t.skillTypeAudio, 1: t.skillTypeText }[
                form.resultType
              ]
            }
            <ChevronDown size={14} />
          </button>
          {typeOpen && (
            <div id="secondary-skill-result-types" role="listbox" aria-label="结果类型">
              {resultTypeOptions.map(([value, label], index) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={form.resultType === value}
                  tabIndex={index === typeIndex ? 0 : -1}
                  className={form.resultType === value ? 'active' : ''}
                  onMouseEnter={() => setTypeIndex(index)}
                  onFocus={() => setTypeIndex(index)}
                  onKeyDown={onResultTypeKeyDown}
                  onClick={() => selectResultType(value)}
                >
                  {label}
                  {value === form.resultType && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {(form.resultType === 2 || form.resultType === 3) && (
          <label className="secondary-skill-cover">
            <span>{t.createSkillFieldCoverOptional}</span>
            <input
              type="file"
              hidden
              ref={cover}
              accept="image/*"
              aria-label="上传封面"
              onChange={uploadCover}
            />
            <button onClick={() => cover.current.click()}>
              {form.coverUrl ? (
                <>
                  <img src={form.coverUrl} alt="cover" />
                  <small>
                    <Upload size={10} />
                    {t.replace}
                  </small>
                </>
              ) : (
                <Plus size={20} />
              )}
            </button>
          </label>
        )}
      </div>
    </main>
  );
}

const SkillCreatePage = withSecondaryData(SkillCreate);
export default SkillCreatePage;
