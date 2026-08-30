function sum<T>(arr: T[], fn: (item: T) => number | null | undefined): number {
  return arr.reduce((total, item) => total + (fn(item) || 0), 0);
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(arr: number[], percentage: number): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (percentage / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(arr: number[]): number | null {
  return arr.length ? sum(arr, (value) => value) / arr.length : null;
}

function fmt1(value: number | string | null | undefined): string {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed.toFixed(1) : '—';
}

function fmt0(value: number | string | null | undefined): string {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Math.round(parsed).toLocaleString('pt-BR') : '—';
}

function quebraTextoTooltip(texto: unknown, max = 44): string[] {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const linhas: string[] = [];
  let atual = '';
  palavras.forEach((palavra) => {
    if (!atual) { atual = palavra; return; }
    if (`${atual} ${palavra}`.length <= max) atual += ` ${palavra}`;
    else { linhas.push(atual); atual = palavra; }
  });
  linhas.push(atual);
  return linhas;
}

function groupBy<T, K>(arr: T[], fn: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  arr.forEach((item) => {
    const key = fn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });
  return groups;
}

function monthLabel(yearMonth: string | null | undefined): string {
  if (!yearMonth) return '—';
  const [year, month] = yearMonth.split('-');
  return `${MESES[Number.parseInt(month, 10)]}/${year.slice(2)}`;
}

function sortedMonthKeys<T extends Record<string, any>>(arr: T[], field: keyof T): string[] {
  const values = arr.map((item) => item[field]).filter(Boolean).map(String);
  return Array.from(new Set(values)).sort();
}

function piSortKey(pi: string | null | undefined): string {
  return pi || 'zzz';
}
