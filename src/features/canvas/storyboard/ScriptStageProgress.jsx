import { Fragment } from 'react';
import { SCRIPT_WORKFLOW_STEPS } from './workflow-model.js';

/** Public 272776/sc: at most 24 ring segments, sampled from the actual stage items. */
function StageRing({ stage, index }) {
  const count = stage.total > 0 ? Math.min(stage.total, 24) : 1;
  const ready =
    stage.total > 24
      ? Math.min(Math.round((stage.ready / stage.total) * count), count)
      : Math.min(stage.ready, count);
  const circumference = 2 * Math.PI * 14;
  const length = circumference / count;
  const complete = stage.status === 'ready';
  return (
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36">
      {complete ? (
        <circle cx="18" cy="18" r="15.5" fill="#F7F7F7" />
      ) : (
        Array.from({ length: count }, (_, item) => {
          const segments = stage.segments || [];
          const segment =
            segments.length > 24
              ? segments[
                  Math.min(Math.floor((item / count) * segments.length), segments.length - 1)
                ]
              : segments[item];
          const status =
            segment?.status ||
            (item < ready ? 'ready' : stage.isBusy && item === ready ? 'loading' : 'default');
          return (
            <circle
              key={item}
              cx="18"
              cy="18"
              r="14"
              fill="none"
              strokeWidth="3"
              stroke={status === 'ready' ? '#F7F7F7' : status === 'loading' ? '#FF7D00' : '#525252'}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-item * length}
              transform="rotate(-90 18 18)"
            />
          );
        })
      )}
      <text
        x="18"
        y="18"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill={complete ? '#111111' : '#F7F7F7'}
      >
        {index + 1}
      </text>
    </svg>
  );
}

/** Public su: stage navigation stays available independently of completion and writes. */
export function ScriptStageProgress({ workflow, currentStep, onStepChange }) {
  return (
    <nav className="cv-script-stepper" aria-label="分镜脚本阶段">
      {SCRIPT_WORKFLOW_STEPS.map((step, index) => {
        const stage = workflow[step.stageId];
        return (
          <Fragment key={step.id}>
            <button
              type="button"
              aria-current={currentStep === step.id ? 'step' : undefined}
              data-complete={stage.status === 'ready'}
              onClick={() => onStepChange(step.id)}
            >
              <StageRing stage={stage} index={index} />
              <span>
                <strong>{step.label}</strong>
                <small>{stage.hint || `${stage.ready}/${stage.total}`}</small>
              </span>
            </button>
            {index < SCRIPT_WORKFLOW_STEPS.length - 1 && (
              <span className="cv-script-step-connector" aria-hidden="true" />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
