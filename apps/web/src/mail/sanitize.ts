export function sanitizeFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  let sanitized = filename.replace(/[/\\]/g, '_');
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  sanitized = sanitized.replace(/_+/g, '_');
  sanitized = sanitized.replace(/^[_.]+|[_.]+$/g, '');
  if (!sanitized) return null;
  const extIndex = sanitized.lastIndexOf('.');
  if (extIndex > 0) {
    const name = sanitized.slice(0, extIndex);
    const ext = sanitized.slice(extIndex);
    const maxNameLen = 200 - ext.length;
    if (name.length > maxNameLen) {
      sanitized = name.slice(0, Math.max(0, maxNameLen)) + ext;
    }
  } else if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 200);
  }
  return sanitized || null;
}
