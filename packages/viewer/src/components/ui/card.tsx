import type { ComponentProps } from "react";

type CardProps = ComponentProps<"div">;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={`flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: CardProps) {
  return (
    <div
      data-slot="card-header"
      className={`grid items-start gap-1 ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: CardProps) {
  return (
    <div
      data-slot="card-title"
      className={`font-semibold ${className}`}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: CardProps) {
  return (
    <div
      data-slot="card-content"
      className={`text-muted-foreground ${className}`}
      {...props}
    />
  );
}

export function CardFooter({ className = "", ...props }: CardProps) {
  return (
    <div
      data-slot="card-footer"
      className={`flex items-center ${className}`}
      {...props}
    />
  );
}
