import './canvas-node-connection-feedback.css';

/** Decorative source connection feedback; graph/hit testing stays in its controller. */
export function CanvasNodeConnectionFeedback({ feedback }) {
  const active = feedback?.isConnectionTarget;
  const invalid = feedback?.isConnectionInvalid;
  const blocked = feedback?.isConnectionBlocked;
  if (!active && !invalid && !blocked) return null;
  return (
    <>
      {invalid ? (
        <div aria-hidden="true" className="cv-node-connection-invalid" />
      ) : active ? (
        <>
          <div aria-hidden="true" className="cv-node-connection-ambient" />
          <div aria-hidden="true" className="cv-node-connection-diffuse" />
          <div aria-hidden="true" className="cv-node-connection-border" />
        </>
      ) : null}
      {(blocked || invalid) && <div aria-hidden="true" className="cv-node-connection-frosted" />}
    </>
  );
}

export default CanvasNodeConnectionFeedback;
