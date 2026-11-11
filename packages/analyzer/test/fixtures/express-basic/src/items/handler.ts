export function readItem(req: { params: { id: string } }, res: { send: (item: string) => void }) {
  const id = req.params.id;
  const first = lookupItem(id);
  const second = lookupItem(first);
  return res.send(second);
}

export const lookupItem = (id: string) => id;
