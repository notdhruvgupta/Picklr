"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useAuth } from "@/lib/data/auth";
import { useData } from "@/lib/data/store";
import { BallIcon } from "./bits";
import { ChartIcon, HomeIcon, ListIcon, TrophyIcon, UsersIcon, WhistleIcon } from "./icons";
import { Button, ErrorNote, cx } from "./ui";

const NAV: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/leaderboard", label: "Ratings", icon: ChartIcon },
  { href: "/matches", label: "Matches", icon: ListIcon },
  { href: "/players", label: "Players", icon: UsersIcon },
  { href: "/tournaments", label: "Events", icon: TrophyIcon },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function DesktopLinks() {
  const pathname = usePathname();
  const { isReferee } = useAuth();
  return (
    <>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            isActive(pathname, item.href) ? "bg-surface-2 text-text" : "text-muted hover:text-text",
          )}
        >
          {item.label}
        </Link>
      ))}
      {isReferee && (
        <Link
          href="/ref"
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            isActive(pathname, "/ref") ? "bg-ball text-ball-fg" : "text-muted hover:text-text",
          )}
        >
          Referee
        </Link>
      )}
    </>
  );
}

function MobileLinks() {
  const pathname = usePathname();
  const { isReferee } = useAuth();
  const items = isReferee ? [...NAV.slice(0, 4), { href: "/ref", label: "Referee", icon: WhistleIcon }] : NAV;
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}
          >
            <Icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function ConnectionDot() {
  const { connection } = useData();
  const label = connection === "live" ? "Live updates on" : connection === "connecting" ? "Connecting…" : "Offline – reconnecting";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={label}>
      <span
        className={cx(
          "size-2 rounded-full",
          connection === "live" ? "bg-win" : connection === "connecting" ? "bg-ball" : "bg-loss live-dot",
        )}
      />
      <span className="sr-only sm:not-sr-only">{connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Offline"}</span>
    </span>
  );
}

function RefereeButton() {
  const { session, isReferee, signOut } = useAuth();
  if (session && isReferee) {
    return (
      <Button variant="ghost" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
    );
  }
  return (
    <Link href="/login" className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-text">
      Referee login
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { settings, status, error } = useData();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold tracking-tight">
            <BallIcon className="size-7 shrink-0" />
            <span className="truncate">{settings?.group_name ?? "Pickleball Elo"}</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            <Suspense fallback={null}>
              <DesktopLinks />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ConnectionDot />
            <RefereeButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-12">
        {status === "error" ? (
          <ErrorNote>Couldn&apos;t load data: {error}. Check your connection and refresh.</ErrorNote>
        ) : (
          children
        )}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <Suspense fallback={null}>
          <MobileLinks />
        </Suspense>
      </nav>
    </div>
  );
}
