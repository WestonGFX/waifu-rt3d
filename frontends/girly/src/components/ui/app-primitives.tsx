import { type ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';

export function AppPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <Card className={cn('p-0', className)}>{children}</Card>;
}

export function AppCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('app-card-surface rounded-[20px] p-0', className)}>
      {children}
    </Card>
  );
}

export function AppMutedNote({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'app-card-surface rounded-[18px] px-3.5 py-2.5 text-xs leading-5 text-text-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AppSectionHeader({
  eyebrow,
  title,
  description,
  aside,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-0.5 font-display text-[0.98rem] font-semibold text-text-primary md:text-base">{title}</div>
        {description ? <p className="mt-0.5 text-sm leading-5 text-text-muted">{description}</p> : null}
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function AppCardSection({
  eyebrow,
  title,
  description,
  aside,
  children,
  className,
  contentClassName,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('p-0', className)}>
      <CardHeader className="p-3.5 pb-2.5">
        <AppSectionHeader eyebrow={eyebrow} title={title} description={description} aside={aside} />
      </CardHeader>
      {children ? <CardContent className={cn('p-3.5 pt-0', contentClassName)}>{children}</CardContent> : null}
    </Card>
  );
}

export function AppStat({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <AppCard className={cn('px-3 py-2.5', className)}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-text-primary md:text-base">{value}</div>
      {detail ? <div className="mt-0.5 text-xs leading-4.5 text-text-muted">{detail}</div> : null}
    </AppCard>
  );
}

export function AppField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.25', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-4.5 text-text-muted">{hint}</span> : null}
    </label>
  );
}

export function AppEyebrowBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="muted" className={cn('uppercase tracking-[0.14em]', className)}>
      {children}
    </Badge>
  );
}

export function AppLibraryCard({
  title,
  subtitle,
  meta,
  active = false,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  active?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'app-card-surface w-full rounded-[20px] px-3 py-3 text-left transition-all',
        active
          ? 'border-anime-400 bg-anime-50/92 text-anime-700 shadow-[0_18px_36px_-30px_var(--color-glow-primary)]'
          : 'text-text-secondary hover:bg-anime-50/80',
        className,
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-text-muted">{subtitle}</div> : null}
      {meta ? <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">{meta}</div> : null}
      {children}
    </button>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge };
