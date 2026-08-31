declare const Chart: any;

interface DashboardQuarterPeriod {
  quarter: string;
  year: number;
  programa: string;
}

interface DashboardQuarterBounds {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

interface DashboardQuarterRules {
  doneStatuses: string[];
  inProgressStatuses: string[];
  ignoredStatuses: string[];
  excludedChildTypes: string[];
  subtaskTypePrefixes: string[];
  transbordoLabels: string[];
  piPeriods: Record<string, DashboardQuarterPeriod>;
  quarterBounds: Record<string, DashboardQuarterBounds>;
}

interface Window {
  __RULES_PENDING: string[];
  __RULES_INPROG: string[];
  __RULES_DONE: string[];
  __RULES_CANCELLED: string[];
  __SPRINTS: DashboardSprint[];
  __QUARTER_RULES: DashboardQuarterRules | null;
  __DEP_TEAMS: Record<string, string>;
}

interface DashboardIssue {
  Chave?: string;
  Resumo?: string;
  Status?: string;
  Squad?: string;
  VS?: string;
  Programa?: string;
  PI?: string;
  Sprints?: string[];
  TempoPorStatus?: Array<Record<string, any>>;
  [field: string]: any;
}

interface DashboardSprint {
  name?: string;
  state?: string;
  startDate?: string | null;
  endDate?: string | null;
  completeDate?: string | null;
  [field: string]: any;
}
