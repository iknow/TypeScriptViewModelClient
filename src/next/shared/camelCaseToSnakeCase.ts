export default function camelCaseToSnakeCase(str: string): string {
  return str.replace(/[A-Z0-9]/g, (m) => `_${m[0].toLowerCase()}`);
}
