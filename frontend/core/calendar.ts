function isoLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoToday(): string {
  return isoLocalDate(new Date());
}

function diasCorridosAteHoje(isoDate: unknown): number | null {
  if (!isoDate) return null;
  const inicioMs = Date.parse(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  const hojeMs = Date.parse(`${isoToday()}T00:00:00Z`);
  if (Number.isNaN(inicioMs) || Number.isNaN(hojeMs)) return null;
  return Math.max(0, Math.round((hojeMs - inicioMs) / 86_400_000));
}

function setDefaultDateRange(): void {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  dateRange.from = isoLocalDate(thirtyDaysAgo);
  dateRange.to = isoLocalDate(today);
}

function dataEntregaEfetiva(issue: DashboardIssue): string | null {
  if (issue['Data Conclusao']) return String(issue['Data Conclusao']);
  if (issue['Tipo Agrupado'] === 'Épico' && issue['Data Entrega Sprint']) {
    return String(issue['Data Entrega Sprint']);
  }
  return null;
}

function dentroDoPeriodoDeEntrega(issue: DashboardIssue): boolean {
  if (!dateRange.from && !dateRange.to) return true;
  const deliveryDate = dataEntregaEfetiva(issue);
  if (!deliveryDate) return false;
  if (dateRange.from && deliveryDate < dateRange.from) return false;
  if (dateRange.to && deliveryDate > dateRange.to) return false;
  return true;
}
