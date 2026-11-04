import { STORAGE_KEYS } from '../../utils/storageKeys';
import { logger } from '../../utils/logger';

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DISCLOSURES);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'boolean'),
    );
  } catch (error) {
    logger.warn('Could not read disclosure state', error);
    return {};
  }
}

let openById = $state.raw<Record<string, boolean>>(load());

export function isOpen(id: string): boolean {
  return openById[id] ?? false;
}

export function setOpen(id: string, open: boolean): void {
  if (isOpen(id) === open) return;
  openById = { ...openById, [id]: open };
  try {
    localStorage.setItem(STORAGE_KEYS.DISCLOSURES, JSON.stringify(openById));
  } catch (error) {
    logger.warn('Could not save disclosure state', error);
  }
}
