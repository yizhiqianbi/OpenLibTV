const array = (value) => (Array.isArray(value) ? value : []);
const identity = (ref) => ref.nodeId || ref.url;
function ordered(values, order, stored = []) {
  const keys = [...array(order), ...array(stored).map(identity)];
  const remaining = [...values];
  const result = [];
  for (const key of keys) {
    const index = remaining.findIndex((ref) => identity(ref) === key);
    if (index >= 0) result.push(...remaining.splice(index, 1));
  }
  return [...result, ...remaining];
}
/** Tokens keep their 1-based list index; IDs identify candidates, never replace the token. */
export function generatorReferenceLists(node, inputs) {
  const params = node?.data?.params || {};
  const lists = Object.fromEntries(
    ['imageList', 'videoList', 'audioList'].map((key) => [
      key,
      ordered(array(inputs[key]), params[key + 'Order'], params[key]),
    ]),
  );
  const combined = [...lists.imageList, ...lists.videoList, ...lists.audioList];
  return {
    ...lists,
    mixedList: ordered(combined, params.mixedListOrder, params.mixedList),
    portraitList: array(params.portraitList),
    elementList: array(params.elementList),
  };
}
