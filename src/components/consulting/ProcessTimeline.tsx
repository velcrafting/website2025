import type { ReactNode } from "react";
import type { stages as consultingStages } from "@/consulting/fixtures";
import styles from "./process-timeline.module.css";

export default function ProcessTimeline({ stages, children }: { stages: typeof consultingStages; children: ReactNode }) {
  return (
    <section id="process" className="scroll-mt-6 py-8 md:py-10" aria-labelledby="process-title">
      <h2 id="process-title">Explore the process</h2>
      <p className="mt-2 max-w-prose">Choose a stage to see how Steven works with you, or start with your own problem.</p>

      <div className={styles.timeline}>
        <fieldset className={styles.rail}>
          <legend className="sr-only">Consulting stages</legend>
          {stages.map((stage, index) => (
            <div className={styles.stop} key={stage.id}>
              <input
                className={`sr-only ${styles.radio}`}
                type="radio"
                name="consulting-stage"
                id={`stage-${stage.id}`}
                value={stage.id}
                defaultChecked={index === 0}
                aria-controls={`stage-panel-${stage.id}`}
              />
              <label className={styles.control} htmlFor={`stage-${stage.id}`}>
                <span className={styles.marker} aria-hidden="true">{index + 1}</span>
                <span>{stage.title}</span>
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
                  <p className="mt-2">{stage.purpose}</p>
                  <dl className={styles.roles}>
                    <div><dt>Steven</dt><dd>{stage.studio}</dd></div>
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
    </section>
  );
}
