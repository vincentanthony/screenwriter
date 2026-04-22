import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Ruler, ScrollText, Sparkles, type LucideIcon } from 'lucide-react';
import type { TitlePageField } from '@/fountain/types';
import type { ViewSettings } from '@/hooks/useViewSettings';

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
  /** Current view-level preferences (page breaks, future rulers/scene numbers/etc.). */
  viewSettings: ViewSettings;
  /** Merge-style update of view preferences. Persists to localStorage. */
  onViewSettingsChange: (patch: Partial<ViewSettings>) => void;
}

/**
 * Contract for a panel's optional main-area override. When a panel
 * provides a MainArea component, ScriptEditor renders it in place of
 * the TipTap editor view (which stays MOUNTED but hidden — writers
 * flip between modes and we don't want to rebuild the editor each time).
 *
 * Today MainArea just needs title-page fields; future panels may want
 * richer context (script body, scene list, export state). Add props
 * here as real panels arrive — don't speculate.
 */
export interface MainAreaProps {
  titlePage: TitlePageField[] | null;
}

export interface DrawerPanel {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * The panel body that renders inside the drawer itself. Lazy so the
   * chassis boots without loading every panel's code.
   */
  Component: LazyExoticComponent<ComponentType<DrawerPanelProps>>;
  /**
   * Optional main-area override. When present, ScriptEditor hides the
   * TipTap editor view and renders this instead. When absent, the
   * editor keeps rendering (e.g., a future Scene Navigator panel might
   * leave the editor visible while adding navigation beside it).
   */
  MainArea?: LazyExoticComponent<ComponentType<MainAreaProps>>;
}

export const DRAWER_PANELS: readonly DrawerPanel[] = [
  {
    id: 'titlePage',
    label: 'Title Page',
    icon: ScrollText,
    Component: lazy(() =>
      import('./panels/TitlePagePanel').then((m) => ({ default: m.TitlePagePanel })),
    ),
    MainArea: lazy(() =>
      import('./panels/TitlePagePreview').then((m) => ({ default: m.TitlePagePreview })),
    ),
  },
  {
    id: 'viewSettings',
    label: 'View settings',
    icon: Ruler,
    Component: lazy(() =>
      import('./panels/ViewSettingsPanel').then((m) => ({ default: m.ViewSettingsPanel })),
    ),
    // No MainArea — the settings panel leaves the editor visible so the
    // writer can see their toggles take effect immediately.
  },
  {
    id: 'aiSettings',
    label: 'AI settings',
    icon: Sparkles,
    Component: lazy(() =>
      import('./panels/AISettingsPanel').then((m) => ({ default: m.AISettingsPanel })),
    ),
    // No MainArea — AI Settings is a pure config surface; editing the
    // script stays unaffected and visible behind the drawer.
  },
] as const;

export function findDrawerPanel(panelId: string): DrawerPanel | null {
  return DRAWER_PANELS.find((p) => p.id === panelId) ?? null;
}
