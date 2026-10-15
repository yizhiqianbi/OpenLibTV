import { withSecondaryData } from '../../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Upload } from 'lucide-react';
import SkillField from './components/SkillField.jsx';
import SkillFileEditor from './components/SkillFileEditor.jsx';
import { skillFields, skillInitial, readLocalSkills, skillFileLimit } from './skill-form.js';
import { writeStoredValue } from '../../../services/storage.ts';
import { template } from '../../shared/secondary/text.js';

function SkillCreate({ data, login, user, navigate, toast, asset }) {
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
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      coverReader.current?.abort();
      coverReader.current = null;
    };
  }, []);
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
    const finish = (failed) => {
      if (!alive.current || coverReader.current !== reader) return;
      coverReader.current = null;
      setUploadingCover(false);
      if (failed) toast?.(t.createSkillUploadFailedRetry);
      else setField('coverUrl', reader.result);
    };
    reader.onload = () => finish(false);
    reader.onerror = () => finish(true);
    try {
      reader.readAsDataURL(f);
    } catch {
      finish(true);
    }
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
          <button onClick={() => setTypeOpen((v) => !v)}>
            {
              { 2: t.skillTypeImage, 3: t.skillTypeVideo, 4: t.skillTypeAudio, 1: t.skillTypeText }[
                form.resultType
              ]
            }
            <ChevronDown size={14} />
          </button>
          {typeOpen && (
            <div>
              {[
                [2, t.skillTypeImage],
                [3, t.skillTypeVideo],
                [4, t.skillTypeAudio],
                [1, t.skillTypeText],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={form.resultType === value ? 'active' : ''}
                  onClick={() => {
                    setField('resultType', value);
                    if (value === 1 || value === 4) setField('coverUrl', '');
                    setTypeOpen(false);
                  }}
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
            <input type="file" hidden ref={cover} accept="image/*" onChange={uploadCover} />
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
