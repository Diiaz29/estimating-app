export function validateSettingDraft(value: string, key: string): string | null {
  if (!value.trim() || !Number.isFinite(Number(value))) return 'Enter a number.'
  if (Number(value) < 0) return 'Enter zero or a positive number.'
  if (/divisor|hours_per_day|per_diem_workday_hours/.test(key) && Number(value) === 0) return 'Enter a number greater than zero.'
  return null
}
