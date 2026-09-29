import Link from "next/link";

import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "bkk", href: "/", label: "กรุงเทพฯ" },
  { id: "central", href: "/central", label: "ลุ่มเจ้าพระยา" },
] as const;

export function ViewSwitcher({
  current,
  className,
}: {
  readonly current: (typeof VIEWS)[number]["id"];
  readonly className?: string;
}) {
  return (
    <nav
      aria-label="เลือกมุมมอง"
      className={cn("flex rounded-md border bg-card p-0.5 text-xs shadow", className)}
    >
      {VIEWS.map((v) => (
        <Link
          key={v.id}
          href={v.href}
          aria-current={v.id === current ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1.5 font-medium whitespace-nowrap",
            v.id === current ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
