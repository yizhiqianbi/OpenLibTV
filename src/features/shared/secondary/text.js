const template = (str, values = {}) =>
  (str || '').replace(/\{([^}]+)\}/g, (_, k) => values[k] ?? 'PenStudio');

// Apply only to our product copy. Public works, author names and source evidence stay intact.
const productCopy = (value) => (value || '').replace(/\bLibTV\b/g, 'PenStudio');

export { productCopy, template };
