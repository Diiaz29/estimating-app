// Explicit account access, independent of the role-preview control.
export const CHANGE_LIST_ACCOUNTS = [
  '1029706b-1888-4ffa-8fe8-f77a2bfe0295', // Brandon Diaz
  'd3180a9a-68cb-4286-a789-d399b486ed15', // Test ChatGPT
]
export const canUseChangeList = (id?: string) => !!id && CHANGE_LIST_ACCOUNTS.includes(id)
