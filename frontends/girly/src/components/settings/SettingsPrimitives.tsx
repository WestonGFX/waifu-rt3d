import {
  AppCard,
  AppCardSection,
  AppField,
  AppLibraryCard,
  AppMutedNote,
  AppPanel,
  AppSectionHeader,
  AppStat,
} from '@/components/ui/app-primitives.tsx';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

export const SETTINGS_PANEL_CARD =
  'rounded-[22px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] p-3.5 shadow-[var(--shell-shadow-soft)] backdrop-blur-sm';

export const SETTINGS_PANEL_SUBCARD =
  'rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] p-2.5 shadow-[var(--shell-shadow-soft)]';

export const SETTINGS_PANEL_MUTED =
  'rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] px-3.5 py-2.5 text-xs leading-5 text-text-muted shadow-[var(--shell-shadow-soft)]';

export const SETTINGS_INPUT =
  'flex h-10 w-full rounded-xl border border-[color:var(--control-border)] bg-[color:var(--control-bg)] px-3 py-2.5 text-sm text-text-primary shadow-[var(--control-shadow)] outline-none transition-colors placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-anime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--control-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50';

export const SETTINGS_PILL_BUTTON = buttonVariants({ variant: 'secondary', size: 'sm' });
export const SETTINGS_PRIMARY_BUTTON = buttonVariants({ variant: 'default', size: 'sm' });
export const SETTINGS_DESTRUCTIVE_BUTTON = buttonVariants({ variant: 'destructive', size: 'sm' });

export {
  AppCard,
  AppCardSection,
  AppField,
  AppLibraryCard,
  AppMutedNote,
  AppPanel,
  AppSectionHeader as SettingsSectionHeader,
  AppStat as SettingsStatCard,
  Button,
  Input,
  Switch,
  Textarea,
};
