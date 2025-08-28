import clsx from "clsx";
type Props = React.InputHTMLAttributes<HTMLInputElement>;
export default function Input({ className, ...rest }: Props) {
  return <input className={clsx("w-full rounded-md border px-3 py-2 text-sm bg-white border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900", className)} {...rest} />;
}
