import clsx from "clsx";
import { forwardRef } from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-sm bg-white border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
      {...rest}
    />
  );
});

export default Input;
