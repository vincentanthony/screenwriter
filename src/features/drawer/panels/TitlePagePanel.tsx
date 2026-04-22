import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getTitlePageFieldValue, upsertTitlePageField } from '../titlePageFields';
import type { DrawerPanelProps } from '../panels';

/**
 * Fountain title-page editor.
 *
 * Renders one input per known title-page key; edits are applied via
 * upsertTitlePageField so unknown keys loaded with the script (e.g.
 * "Language: French") stay in the underlying fields array even though
 * the form never surfaces them. The parent (ScriptEditor) wires
 * onTitlePageUpdate to the autosave path — we never save directly.
 */

interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

const FORM_FIELDS: readonly FormField[] = [
  { key: 'Title', label: 'Title' },
  { key: 'Credit', label: 'Credit', placeholder: 'Written by' },
  { key: 'Author', label: 'Author' },
  { key: 'Source', label: 'Source', placeholder: 'Based on the novel by …' },
  { key: 'Draft date', label: 'Draft date' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Notes', label: 'Notes', multiline: true },
  { key: 'Copyright', label: 'Copyright' },
] as const;

export function TitlePagePanel({ titlePage, onTitlePageUpdate }: DrawerPanelProps) {
  const setField = (key: string, value: string) => {
    onTitlePageUpdate(upsertTitlePageField(titlePage ?? [], key, value));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        // Live save is the principle — there is no submit button, but
        // suppress accidental form submits (e.g., Enter inside an input
        // would otherwise navigate / reload in some browsers).
        e.preventDefault();
      }}
    >
      {FORM_FIELDS.map(({ key, label, placeholder, multiline }) => {
        const id = `tp-${key.replace(/\s+/g, '-').toLowerCase()}`;
        return (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {multiline ? (
              <Textarea
                id={id}
                placeholder={placeholder}
                value={getTitlePageFieldValue(titlePage, key)}
                onChange={(e) => setField(key, e.target.value)}
                rows={4}
              />
            ) : (
              <Input
                id={id}
                placeholder={placeholder}
                value={getTitlePageFieldValue(titlePage, key)}
                onChange={(e) => setField(key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </form>
  );
}
