/**
 * lib/countries.ts — códigos ISO-3166 alfa-2. Los nombres localizados los
 * resuelve `Intl.DisplayNames` en el idioma activo (sin catálogos).
 */
export const COUNTRY_CODES = [
  "AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT",
  "HN", "MX", "NI", "PA", "PY", "PE", "PR", "UY", "VE", "ES",
  "US", "CA", "GB", "IE", "PT", "FR", "IT", "DE", "NL", "BE",
  "CH", "AT", "SE", "NO", "DK", "FI", "PL", "GR", "TR", "IL",
  "AE", "SA", "EG", "MA", "NG", "ZA", "KE", "IN", "PK", "BD",
  "CN", "JP", "KR", "TW", "SG", "AU", "NZ", "PH", "ID", "MY",
  "TH", "VN",
] as const;

export function countryName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}
