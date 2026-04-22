import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { ScrollText, type LucideIcon } from 'lucide-react';
import type { TitlePageField } from '@/fountain/types';

/**
 * Contract every drawer panel agrees to. New panels can extend this
 * with additional props as their needs grow, but the chassis itself
 * only cares about the stable props declared here.
 */
export interface DrawerPanelProps {
  /** Current title-page fields as parsed from the script's fountain. */
  titlePage: TitlePageField[] | null;
  /** Replace the title-page fields. Triggers live autosave through ScriptEditor. */
  onTitlePageUpdate: (fields: TitlePageField[]) => void;
}

export interface DrawerPanel {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Lazy import so the chassis boots without loading every panel's code.
   * Adding a new panel = one entry here + one new file under ./panels/.
   */
  Component: LazyExoticComponent<ComponentType<DrawerPanelProps>>;
}

export const DRAWER_PANELS: readonly DrawerPanel[] = [
  {
    id: 'titlePage',
    label: 'Title Page',
    icon: ScrollText,
    Component: lazy(() =>
      import('./panels/TitlePagePanel').then((m) => ({ default: m.TitlePagePanel })),
    ),
  },
] as const;

export function findDrawerPanel(panelId: string): DrawerPanel | null {
  return DRAWER_PANELS.find((p) => p.id === panelId) ?? null;
}
