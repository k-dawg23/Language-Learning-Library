import type { ReactNode } from "react";

type AppShellProps = {
  sidebar: ReactNode;
  content: ReactNode;
};

export function AppShell({ sidebar, content }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      <main className="content">{content}</main>
    </div>
  );
}
