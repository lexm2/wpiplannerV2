import type { PeriodType } from '../types/types';

// Period-type -> CSS-class / short-label lookups (pure data tables, not view logic).

export function getPeriodTypeClass(type: string | PeriodType): string {
  const typeStr = String(type).toLowerCase();

  if (typeStr.includes('lab')) return 'section-period-type--lab';
  if (typeStr.includes('dis') || typeStr.includes('discussion'))
    return 'section-period-type--dis';
  if (typeStr.includes('rec') || typeStr.includes('recitation'))
    return 'section-period-type--rec';
  if (typeStr.includes('sem') || typeStr.includes('seminar'))
    return 'section-period-type--sem';
  if (typeStr.includes('studio')) return 'section-period-type--stu';
  if (typeStr.includes('workshop')) return 'section-period-type--wks';
  if (typeStr.includes('experiential')) return 'section-period-type--exp';
  if (typeStr.includes('internship')) return 'section-period-type--int';
  if (typeStr.includes('independent')) return 'section-period-type--ind';
  if (typeStr.includes('research')) return 'section-period-type--res';
  if (typeStr.includes('thesis')) return 'section-period-type--ths';
  if (typeStr.includes('conference') || typeStr.includes('conf'))
    return 'section-period-type--conf';

  return '';
}

export function getPeriodTypeLabel(type: string | PeriodType): string {
  const typeStr = String(type);
  const lower = typeStr.toLowerCase();

  if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
  if (lower.includes('lab')) return 'LAB';
  if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
  if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
  if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
  if (lower.includes('studio')) return 'STU';
  if (lower.includes('conference') || lower.includes('conf')) return 'CONF';
  if (lower.includes('workshop')) return 'WKS';
  if (lower.includes('experiential')) return 'EXP';
  if (lower.includes('independent')) return 'IND';
  if (lower.includes('internship')) return 'INT';
  if (lower.includes('research')) return 'RES';
  if (lower.includes('thesis')) return 'THS';

  return typeStr.substring(0, Math.min(4, typeStr.length)).toUpperCase();
}
