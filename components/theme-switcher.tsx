'use client';

import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  BRAND_THEME_LABELS,
  BRAND_THEMES,
  type BrandTheme
} from '@/lib/theme';
import { cn } from '@/lib/utils';

export function ThemeSwitcher({
  className,
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  const { brand, mode, setBrand, toggleMode } = useTheme();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            className={cn(
              'rounded-xl border-border bg-card shadow-sm transition-colors duration-150',
              compact ? 'size-9' : 'h-9 gap-1.5 px-2.5'
            )}
            aria-label={`Brand theme: ${BRAND_THEME_LABELS[brand]}`}
          >
            <Palette className="size-4 text-primary" aria-hidden />
            {!compact ? (
              <span className="hidden text-xs font-medium sm:inline">
                {BRAND_THEME_LABELS[brand]}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Brand theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={brand}
            onValueChange={(value) => setBrand(value as BrandTheme)}
          >
            {BRAND_THEMES.map((id) => (
              <DropdownMenuRadioItem key={id} value={id} className="gap-2">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    id === 'executive' && 'bg-[#2563EB]',
                    id === 'emerald' && 'bg-[#059669]',
                    id === 'luxury' && 'bg-[#C08B2D]'
                  )}
                  aria-hidden
                />
                {BRAND_THEME_LABELS[id]}
                {brand === id ? (
                  <Check className="ml-auto size-3.5 text-primary" aria-hidden />
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              toggleMode();
            }}
            className="gap-2"
          >
            {mode === 'dark' ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
            {mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 rounded-xl border-border bg-card shadow-sm transition-colors duration-150"
        onClick={toggleMode}
        aria-label={
          mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        }
      >
        {mode === 'dark' ? (
          <Sun className="size-4" aria-hidden />
        ) : (
          <Moon className="size-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}
