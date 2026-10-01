type Category = { name: string; count: number }

export default function LibraryCategories({ categories, selected, onSelect }: {
  categories: Category[]
  selected: string | null
  onSelect: (category: string | null) => void
}) {
  return (
    <nav className="library-category-nav" aria-label="Library categories">
      <h2>Categories</h2>
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)}>
        All categories<span>{categories.reduce((total, category) => total + category.count, 0)}</span>
      </button>
      {categories.map(({ name, count }) => (
        <button key={name} type="button" aria-pressed={selected === name} onClick={() => onSelect(name)}>
          {name.toLowerCase()}<span>{count}</span>
        </button>
      ))}
    </nav>
  )
}
