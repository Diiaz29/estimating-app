export function validatedNames(first: unknown, last: unknown) {
  if (typeof first !== 'string' || typeof last !== 'string') return null
  const firstName = first.trim(), lastName = last.trim()
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) return null
  return { first_name: firstName, last_name: lastName }
}
