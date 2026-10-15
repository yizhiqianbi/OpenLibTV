import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Crown, Copy } from 'lucide-react';
import WatchHeader from './components/WatchHeader.jsx';
import CoursePlayer from './player/CoursePlayer.jsx';
import LandscapeTopBar from './player/LandscapeTopBar.jsx';
import LandscapeEpisodeDrawer from './player/LandscapeEpisodeDrawer.jsx';
import { useCourseProgress } from './course/useCourseProgress.js';
import { usePlayerViewport } from './player/usePlayerViewport.js';
import Modal from '../../components/Modal.jsx';
import { asset as defaultAsset } from '../../data.js';
import { academyRepository } from './course/repository.js';
import { useAcademyResource } from './course/useAcademyResource.js';
import { firstPlayable, outlineLeaves } from './course/model.js';
import CourseMemberModal from './course/CourseMemberModal.jsx';
import { useCourseMarketing } from './course/useCourseMarketing.js';
import { resolveFollowupGate } from './course/marketing-model.js';
import { CourseMarketingModal, CourseMinuteBar } from './course/CourseMarketingViews.jsx';
import { usePracticeIntroGate } from './course/usePracticeIntroGate.js';
import PracticeIntroModal from './course/PracticeIntroModal.jsx';
import { openPracticeWindow, practiceUrl } from './course/practice-entry.js';
import CourseCatalog, { CourseCatalogSkeleton } from './course/CourseCatalog.jsx';
import { AcademyState } from './course/AcademyState.jsx';
import './course/course.css';

export default function CoursePage({
  path,
  courseId: suppliedId,
  navigate,
  asset = defaultAsset,
  login,
  user,
  toast,
  repository = academyRepository,
  marketingFrequency,
  introMemory,
  openPractice = openPracticeWindow,
}) {
  const courseId = suppliedId || path?.split('/')[3] || '';
  const detail = useAcademyResource(courseId, (options) => repository.course(courseId, options), {
    keepPrevious: true,
  });
  const [selection, setSelection] = useState({ owner: courseId, id: '' });
  const [member, setMember] = useState(null);
  const [mobilePractice, setMobilePractice] = useState(null);
  const { mobile } = usePlayerViewport();
  const page = useRef(null);
  const focusAfterLesson = useRef(null);
  const practiceReturnFocus = useRef(null);
  const pausePlayer = useRef(null);
  const registerPause = useCallback((pause) => {
    pausePlayer.current = pause;
  }, []);
  useEffect(() => {
    if (detail.data && (selection.owner !== courseId || !selection.id))
      setSelection({ owner: courseId, id: firstPlayable(detail.data) });
  }, [courseId, detail.data, selection.owner, selection.id]);
  const selected =
    (selection.owner === courseId && selection.id) ||
    (detail.data ? firstPlayable(detail.data) : '');
  const selectedLeaf =
    detail.data &&
    outlineLeaves(detail.data.units).find((leaf) => leaf.sectionId === selected && leaf.available);
  const lesson = useAcademyResource(selectedLeaf ? `${courseId}:${selected}` : '', (options) =>
    repository.lesson(selected, options),
  );
  const marketingConfig = useAcademyResource(
    typeof repository.marketingConfig === 'function' ? `${courseId}:marketing` : '',
    (options) => repository.marketingConfig(options),
  );
  const marketing = useCourseMarketing({
    courseId,
    sectionId: selected,
    detail: detail.data,
    user,
    config: marketingConfig.data,
    repository,
    frequency: marketingFrequency,
    debug: new URLSearchParams(location.search).get('courseMarketingDebug') === '1',
    onPaywall: setMember,
  });
  const practiceGate = usePracticeIntroGate({
    courseId,
    user,
    open: openPractice,
    memory: introMemory,
  });
  const progress = useCourseProgress({
    courseId,
    sectionId: selected,
    repository,
    enabled: !!user && !!selectedLeaf && !!lesson.data,
    intervalSec: lesson.data?.heartbeatIntervalSec ?? 15,
    alreadyDone: selectedLeaf?.status === 'done',
    onNewWatchDone: marketing.recordCompletion,
    onWatchDone: () => detail.reload(),
  });
  useEffect(() => {
    if (lesson.data && focusAfterLesson.current === selected) {
      focusAfterLesson.current = null;
      page.current?.querySelector('.academy-player')?.focus();
    }
  }, [lesson.data, selected]);
  useEffect(() => {
    if (!mobilePractice && practiceReturnFocus.current) {
      const target = practiceReturnFocus.current;
      practiceReturnFocus.current = null;
      if (target.isConnected) target.focus();
    }
  }, [mobilePractice]);
  const available = detail.data
    ? outlineLeaves(detail.data.units).filter((leaf) => leaf.available)
    : [];
  const index = available.findIndex((leaf) => leaf.sectionId === selected);
  const select = (id) => {
    if (id === selected || !available.some((leaf) => leaf.sectionId === id)) return;
    progress.flush({ final: true });
    setSelection({ owner: courseId, id });
  };
  function practice(nodeId) {
    pausePlayer.current?.();
    if (mobile) {
      const focused = document.activeElement;
      practiceReturnFocus.current = focused?.closest('.academy-player-drawer-overlay')
        ? page.current?.querySelector('.academy-player button[aria-label="选集"]')
        : focused;
      setMobilePractice({ owner: courseId, nodeId: nodeId || '' });
      return;
    }
    openPractice(courseId, nodeId);
  }
  function enterPractice() {
    pausePlayer.current?.();
    const nodeId = detail.data?.lastPracticeNodeUuid || undefined;
    if (mobile) return practice(nodeId);
    if (detail.data)
      practiceGate.requestEnter({
        courseId,
        title: detail.data.title,
        creditsGrant: detail.data.creditsGrant,
        practiceNodeUuid: nodeId,
      });
    else openPractice(courseId);
  }
  async function copyPractice() {
    try {
      const node = mobilePractice?.owner === courseId && mobilePractice.nodeId;
      await navigator.clipboard.writeText(`${location.origin}${practiceUrl(courseId, node)}`);
      toast?.('链接已复制，请在 PC 端打开');
    } catch {
      toast?.('复制失败，请手动复制地址栏链接');
    }
  }
  const actions = (
    <>
      {detail.data?.practiceEnabled && (
        <button className="academy-course-training" onClick={enterPractice}>
          <Gift size={18} />
          <span>获得 {detail.data.creditsGrant} 积分，去 AI 跟练室</span>
        </button>
      )}
      <button className="academy-course-member-entry" onClick={() => setMember({ courseId })}>
        <Crown size={18} />
        购买课程会员<small>限时优惠</small>
      </button>
    </>
  );
  const noLesson = !lesson.data;
  const currentPractice = detail.data?.practiceEnabled && selectedLeaf?.practiceNodes?.length > 0;
  return (
    <div ref={page} className={`academy-course-page ${noLesson ? 'is-skeleton' : ''}`}>
      <WatchHeader title={detail.data?.title || ''} navigate={navigate}>
        {actions}
      </WatchHeader>
      <div className="academy-course-columns">
        <main>
          {noLesson ? (
            <div className="academy-course-stage" role="status" aria-label="课程加载中">
              <div className="academy-course-shimmer academy-course-video-skeleton" />
              <div className="academy-course-meta-skeleton">
                <i className="academy-course-shimmer" />
                <i className="academy-course-shimmer" />
              </div>
              {(detail.error || lesson.error) && (
                <AcademyState retry={detail.error ? detail.reload : lesson.reload}>
                  课程信息加载失败，请刷新重试
                </AcademyState>
              )}
            </div>
          ) : (
            <div className="academy-course-stage">
              <CoursePlayer
                item={lesson.data}
                asset={asset}
                playbackKey={selected}
                resumeSec={lesson.data.resumeSec}
                markers={lesson.data.markers}
                hasNext={index >= 0 && index < available.length - 1}
                onNext={() => {
                  if (index >= 0 && index < available.length - 1)
                    select(available[index + 1].sectionId);
                }}
                onTrainingRoom={currentPractice ? enterPractice : undefined}
                onGoPracticeMark={
                  detail.data.practiceEnabled
                    ? (marker) => practice(marker.practiceUuid)
                    : undefined
                }
                onBack={() => navigate('/academy')}
                onPauseReady={registerPause}
                canStartPlayback={() => !!selectedLeaf}
                onProgressTick={progress.tick}
                onProgressFlush={progress.flush}
                onPositionChange={progress.updatePosition}
                onPlaybackRateChange={progress.updateRate}
                followupGate={resolveFollowupGate({
                  marketingOpen: !!marketing.popup,
                  marketingTookOver: marketing.marketingTookOver,
                  holding: progress.followupGate === 'hold',
                })}
                positionThresholdSec={marketing.minuteThresholdSec}
                onPositionThresholdReached={marketing.onMinuteThresholdReached}
                landscapeChrome={(chrome) =>
                  chrome.landscapeMode ? (
                    <>
                      <LandscapeTopBar
                        title={lesson.data.title}
                        subtitle="课程播放"
                        onBack={chrome.onExitFullscreen}
                        onOpenSettings={chrome.onOpenSettings}
                      />
                      {chrome.drawer === 'episodes' && (
                        <LandscapeEpisodeDrawer
                          detail={detail.data}
                          currentSectionId={selected}
                          onSelect={(id) => {
                            if (id !== selected && available.some((leaf) => leaf.sectionId === id))
                              focusAfterLesson.current = id;
                            select(id);
                          }}
                          onClose={chrome.closeDrawer}
                          onGoPractice={(id) => {
                            chrome.closeDrawer();
                            practice(id);
                          }}
                        />
                      )}
                    </>
                  ) : null
                }
              />
              {progress.error && (
                <div className="academy-course-progress-error" role="alert">
                  {progress.error}
                  <button onClick={progress.retry}>重试</button>
                </div>
              )}
              <div className="academy-course-meta">
                <div className="academy-course-meta-title">
                  <h1>{lesson.data.title}</h1>
                  {!mobile && marketing.minuteBarVisible && marketing.minuteBarText && (
                    <CourseMinuteBar
                      text={marketing.minuteBarText}
                      onClick={marketing.openPaywallFromBar}
                    />
                  )}
                </div>
                <p>{lesson.data.intro}</p>
              </div>
            </div>
          )}
        </main>
        {noLesson && (
          <div className="academy-course-mobile-tab-skeleton">
            <i className="academy-course-shimmer" />
          </div>
        )}
        {!noLesson && <div className="academy-course-mobile-actions">{actions}</div>}
        {noLesson ? (
          <CourseCatalogSkeleton />
        ) : (
          <aside>
            <CourseCatalog
              course={detail.data}
              failed={!!detail.error}
              onRetry={detail.reload}
              selected={selected}
              onSelect={select}
              onPractice={practice}
              previous={index > 0 ? () => select(available[index - 1].sectionId) : null}
              next={
                index >= 0 && index < available.length - 1
                  ? () => select(available[index + 1].sectionId)
                  : null
              }
            />
          </aside>
        )}
      </div>
      {(marketing.error || marketingConfig.error) && (
        <div className="academy-course-marketing-error" role="alert">
          {marketingConfig.error ? '课程优惠配置加载失败，请重试' : marketing.error}
          <button onClick={marketingConfig.error ? marketingConfig.reload : marketing.retry}>
            重试
          </button>
        </div>
      )}
      {member?.courseId === courseId && (
        <CourseMemberModal
          courseId={courseId}
          touchpointScene={member.touchpointScene}
          onClose={() => setMember(null)}
          repository={repository}
          user={user}
          login={login}
        />
      )}
      {practiceGate.introCourse && (
        <PracticeIntroModal
          course={practiceGate.introCourse}
          onClose={practiceGate.closeIntro}
          onStart={practiceGate.startPractice}
          error={practiceGate.error}
        />
      )}
      {marketing.popup && (
        <CourseMarketingModal
          content={marketing.popup.content}
          asset={asset}
          onDismiss={marketing.closePopup}
          onPrimary={marketing.openPaywallFromPopup}
        />
      )}
      {mobilePractice?.owner === courseId && (
        <Modal
          title="AI 跟练室"
          className="academy-training-mobile-modal"
          onClose={() => setMobilePractice(null)}
        >
          <h2>AI 跟练室</h2>
          <p>为获得最佳练习体验，建议前往 PC 端进行跟练</p>
          <div>
            <button onClick={() => setMobilePractice(null)}>留在视频课</button>
            <button onClick={copyPractice}>
              <Copy size={14} />
              复制链接
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
