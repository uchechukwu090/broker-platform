import * as React from "react";
import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "danger" | "warning" | "info";
}

const VARIANT: Record<NonNullable<AlertProps["variant"]>, string> = {
  default: "border-zinc-700 bg-zinc-800/50 text-zinc-200",
  success: "border-emerald-700/50 bg-emerald-900/20 text-emerald-200",
  danger: "border-red-700/50 bg-red-900/20 text-red-200",
  warning: "border-yellow-700/50 bg-yellow-900/20 text-yellow-200",
  info: "border-sky-700/50 bg-sky-900/20 text-sky-200",
};

export function Alert({ className, variant = "default", ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-lg border p-4 text-sm",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
