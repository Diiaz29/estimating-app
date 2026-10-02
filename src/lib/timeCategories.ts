export const timeCategories = [
  { value: 'shop', label: 'Shop time' },
  { value: 'field', label: 'Install time' },
  { value: 'site_visit', label: 'Site visit' },
  { value: 'punch_list', label: 'Punch list' },
] as const
export type TimeCategory = typeof timeCategories[number]['value']
export const timeCategoryLabel = (kind: string) => timeCategories.find(category => category.value === kind)?.label ?? kind
