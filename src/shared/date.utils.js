'use strict';

/**
 * Utilitários de data usados pelos serviços de domínio.
 * Sem dependências externas — apenas funções puras.
 */

/** Converte uma string ISO (ou Date) para objeto Date; null se vazio. */
function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Retorna a data no formato 'YYYY-MM-DD' (parte de data, em UTC). */
function toIsoDate(value) {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Retorna 'YYYY-MM'. */
function toYearMonth(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 7) : null;
}

/** Retorna o ano (Number). */
function toYear(value) {
  const d = toDate(value);
  return d ? d.getUTCFullYear() : null;
}

/**
 * Arredondamento "round half to even" (banker's rounding) — idêntico ao
 * round() do Python usado no ETL original. Garante que os números batam
 * exatamente (evita divergências de 0,1 em fronteiras .x5).
 */
function roundHalfEven(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return value;
  const f = 10 ** decimals;
  const x = value * f;
  const floor = Math.floor(x);
  const diff = x - floor;
  let rounded;
  const EPS = 1e-9;
  if (Math.abs(diff - 0.5) < EPS) {
    rounded = floor % 2 === 0 ? floor : floor + 1; // vai para o par
  } else {
    rounded = Math.round(x);
  }
  return rounded / f;
}

/** Diferença em dias entre duas datas (b - a), arredondada a `decimals` casas. */
function diffDays(a, b, decimals = 2) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  const days = (db.getTime() - da.getTime()) / 86400000;
  return roundHalfEven(days, decimals);
}

/** Meia-noite (UTC) do dia informado — usada como "agora" de referência. */
function startOfDayUtc(value) {
  const d = toDate(value) || new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

module.exports = { toDate, toIsoDate, toYearMonth, toYear, diffDays, startOfDayUtc, roundHalfEven };
