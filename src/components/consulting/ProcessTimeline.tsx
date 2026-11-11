import type { stages as consultingStages } from "@/consulting/fixtures";
import Button from "@/components/ui/Button";
import styles from "./process-timeline.module.css";

export default function ProcessTimeline({ stages }: { stages: typeof consultingStages }) {
  return (
    <section id="process" className="scroll-mt-6 py-8 md:py-10" aria-labelledby="process-title">
      <h2 id="process-title">Explore the process</h2>
      <p className="mt-2 max-w-prose">Choose a stage to see what we do together and what you get.</p>

      <fieldset className={styles.timeline}>
        <legend className="sr-only">Consulting stages</legend>
        <div className={styles.rail}>
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
        </div>

        {stages.map((stage) => (
          <section
            className={styles.panel}
            key={stage.id}
            id={`stage-panel-${stage.id}`}
            data-stage-panel={stage.id}
            aria-labelledby={`stage-title-${stage.id}`}
          >
            <div className={styles.intro}>
              <h3 className={styles.stageTitle} id={`stage-title-${stage.id}`}>{stage.title}</h3>
              <p className="mt-3">{stage.purpose}</p>
            </div>
            <div className={styles.example}>
              <p className={styles.caption}>Fictional example · Request review workflow</p>
              <div className={styles.artifact}>
                <p className={styles.artifactTitle}>{stage.output}</p>
                <dl>
                  {stage.sample.map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </div>
            </div>
            <dl className={styles.roles}>
              <div><dt>Velcrafting</dt><dd>{stage.studio}</dd></div>
              <div><dt>You</dt><dd>{stage.client}</dd></div>
            </dl>
          </section>
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button asChild variant="outline"><a href="#explorer">Start with your own problem <span aria-hidden="true">↓</span></a></Button>
        <p className="max-w-prose text-sm text-muted">Some stages can combine. We agree on the scope and update schedule together.</p>
      </div>
    </section>
  );
}
