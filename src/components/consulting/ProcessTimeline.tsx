import type { ReactNode } from "react";
import type { stages as consultingStages } from "@/consulting/fixtures";
import disclosure from "./disclosure.module.css";
import styles from "./process-timeline.module.css";

const statusLabels = {
  unvisited: "Unvisited",
  active: "In progress",
  answered: "Answered",
  unanswered: "Unanswered",
  skipped: "Skipped",
};
export type StageStatus = keyof typeof statusLabels;

export default function ProcessTimeline({ stages, activeStage, statuses, attention, onStageChange, children }: {
  stages: typeof consultingStages;
  activeStage: number;
  statuses: readonly StageStatus[];
  attention: { index: number; count: number } | null;
  onStageChange: (index: number) => void;
  children: ReactNode;
}) {
  return (
    <details id="process" className="scroll-mt-6 py-2" open>
      <summary className={disclosure.summary}>
        <h2 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xl!">
          <span>Explore the process</span>
          <span className="text-sm font-normal tracking-normal">Add what you know. A problem summary is required to book. You can skip the rest.</span>
        </h2>
      </summary>

      <div className={styles.timeline}>
        <fieldset className={styles.rail}>
          <legend className="sr-only">Consulting stages</legend>
          {stages.map((stage, index) => (
            <div className={styles.stop} key={stage.id} data-status={statuses[index]}>
              <input
                className={`sr-only ${styles.radio}`}
                type="radio"
                name="consulting-stage"
                id={`stage-${stage.id}`}
                value={stage.id}
                checked={index === activeStage}
                onChange={() => onStageChange(index)}
                aria-label={stage.title}
                aria-describedby={`stage-status-${stage.id}`}
                aria-controls={`stage-panel-${stage.id}`}
              />
              <label className={styles.control} htmlFor={`stage-${stage.id}`}>
                <span className={styles.marker} key={attention?.index === index ? attention.count : 0}
                  data-attention={attention?.index === index ? "" : undefined} aria-hidden="true">
                  {statuses[index] === "answered" ? "✓" : statuses[index] === "skipped" ? "–" : index + 1}
                </span>
                <span>{stage.title}</span>
                <span id={`stage-status-${stage.id}`} className={styles.status}>{statusLabels[statuses[index]]}</span>
              </label>
            </div>
          ))}
        </fieldset>

        <div className={styles.columns}>
          <div className="min-w-0">
            {stages.map((stage) => (
              <section
                className={styles.panel}
                key={stage.id}
                id={`stage-panel-${stage.id}`}
                data-stage-panel={stage.id}
                aria-labelledby={`stage-title-${stage.id}`}
              >
                <div className={styles.intro}>
                  <p className={styles.caption}>What it is</p>
                  <h3 className={styles.stageTitle} id={`stage-title-${stage.id}`}>{stage.title}</h3>
                  <p className="mt-1">{stage.purpose}</p>
                  <dl className={styles.roles}>
                    <div><dt>How Steven helps</dt><dd>{stage.studio}</dd></div>
                    <div><dt>You</dt><dd>{stage.client}</dd></div>
                  </dl>
                </div>
                <div className={styles.example}>
                  <p className={styles.caption}>Fictional example</p>
                  <div className={styles.artifact}>
                    <p className={styles.artifactTitle}>{stage.output}</p>
                    <dl>
                      {stage.sample.map(([label, value]) => (
                        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                      ))}
                    </dl>
                  </div>
                </div>
              </section>
            ))}
          </div>
          <div className={styles.intake}>{children}</div>
        </div>
      </div>
    </details>
  );
}
