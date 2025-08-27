"use client";

type Item = { src: string; alt: string; caption?: string };

export default function Gallery({ images }: { images: Item[] }) {
  return (
    <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((it, i) => (
        <figure key={i} className="rounded-xl border border-neutral-800 p-2">
          <img src={it.src} alt={it.alt} className="w-full rounded-lg" />
          {it.caption ? (
            <figcaption className="mt-2 text-sm text-neutral-400 text-center">
              {it.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
