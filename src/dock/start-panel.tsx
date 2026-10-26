import { Button } from "./ui/button";
import { Icon } from "./icon";

export function StartPanel({
  paused,
  count,
  onEdit,
  onHide,
  onEdits,
  onResume,
}: {
  paused: boolean;
  count: number;
  onEdit: () => void;
  onHide: () => void;
  onEdits: () => void;
  onResume: () => void;
}) {
  return (
    <section className="panel-home" aria-label="Start">
      <div className="start-heading">
        <h2>{paused ? "Site paused" : "Edit this page"}</h2>
        <p>
          {paused
            ? "Resume to edit or hide elements."
            : "Choose an element to edit or hide."}
        </p>
      </div>
      {paused ? (
        <Button id="resume-site" variant="primary" onClick={onResume}>
          Resume site
        </Button>
      ) : (
        <div className="start-actions">
          <Button
            id="start-edit"
            variant="primary"
            className="start-action"
            onClick={onEdit}
          >
            <Icon name="edit" />
            <span>
              <strong>Edit an element</strong>
              <small>Change text and appearance.</small>
            </span>
            <span className="start-arrow" aria-hidden="true">
              →
            </span>
          </Button>
          <Button id="start-hide" className="start-action" onClick={onHide}>
            <Icon name="hide" />
            <span>
              <strong>Hide an element</strong>
              <small>Remove it from view.</small>
            </span>
            <span className="start-arrow" aria-hidden="true">
              →
            </span>
          </Button>
        </div>
      )}
      {count > 0 && (
        <Button
          id="view-edits"
          className="start-saved"
          variant="ghost"
          onClick={onEdits}
        >
          <Icon name="rules" /> View {count} {count === 1 ? "edit" : "edits"}
        </Button>
      )}
    </section>
  );
}
