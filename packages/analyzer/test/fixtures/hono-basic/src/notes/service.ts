export const toDto = (note: string) => ({ note });
export function readNote(key: string, title?: string) {
  const ignored = () => skipNested();
  return title ?? helper(key);
}
export function helper(key: string) {
  return key;
}
export function skipNested() {
  return "ignored";
}
