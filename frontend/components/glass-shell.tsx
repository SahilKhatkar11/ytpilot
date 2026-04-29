import clsx from "clsx";

export function GlassPanel({
  className,
  children
}: Readonly<{ className?: string; children: React.ReactNode }>) {
  return <section className={clsx("glass-panel", className)}>{children}</section>;
}

