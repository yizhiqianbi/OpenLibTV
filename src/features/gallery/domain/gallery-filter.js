export function selectGallerySource({ initial, all, categories = [], override, selected = 0 }) {
  if (override) return override;
  if (selected) return categories.find((category) => category.id === selected)?.items || [];
  return all?.items || all?.defaultItems || initial?.items || [];
}

export function filterGalleryItems({ source = [], all, override, selected = 0, search = '' }) {
  const items = search && !override && !selected ? all?.allItems || source : source;
  const query = search.toLowerCase();
  return items.filter(
    (item) =>
      !query ||
      [item.name || item.title, item.nickname, item.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
}
