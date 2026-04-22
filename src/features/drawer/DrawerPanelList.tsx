import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DRAWER_PANELS } from './panels';

interface Props {
  onPanelClick: (panelId: string) => void;
}

/**
 * Layer 1 — the list of available drawer panels. Renders whatever's in
 * DRAWER_PANELS; the chassis is agnostic to which panels exist.
 */
export function DrawerPanelList({ onPanelClick }: Props) {
  return (
    <nav aria-label="Drawer panels" className="flex-1 overflow-auto p-2">
      <ul className="space-y-1">
        {DRAWER_PANELS.map((panel) => {
          const Icon = panel.icon;
          return (
            <li key={panel.id}>
              <button
                type="button"
                onClick={() => onPanelClick(panel.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm',
                  'text-left hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{panel.label}</span>
                <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
