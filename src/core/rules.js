import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_RULES = [
  { id: 'images', name: 'Fotos & Bilder', folder: 'Fotos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'svg', 'avif', 'raw', 'cr2', 'nef', 'arw'], enabled: true, color: '#b99aff', icon: 'image' },
  { id: 'videos', name: 'Videos', folder: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'wmv', 'webm', 'm4v', 'flv', 'mpeg', 'mpg', '3gp'], enabled: true, color: '#ffac91', icon: 'video' },
  { id: 'docs', name: 'Dokumente', folder: 'Dokumente', extensions: ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'md', 'tex', 'pages', 'epub'], enabled: true, color: '#83bff6', icon: 'file-text' },
  { id: 'audio', name: 'Musik & Audio', folder: 'Musik', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'aiff', 'wma', 'mid', 'midi'], enabled: true, color: '#e4b2ff', icon: 'music' },
  { id: 'archives', name: 'Archive', folder: 'Archive', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab'], enabled: true, color: '#f9ce8b', icon: 'archive' },
  { id: 'code', name: 'Code & Projekte', folder: 'Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cs', 'cpp', 'c', 'h', 'hpp', 'rs', 'go', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'ps1', 'ipynb'], enabled: true, color: '#83dbbc', icon: 'code' },
  { id: 'tables', name: 'Tabellen', folder: 'Tabellen', extensions: ['xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods', 'numbers'], enabled: true, color: '#a9dd9b', icon: 'table' },
  { id: 'slides', name: 'Präsentationen', folder: 'Präsentationen', extensions: ['ppt', 'pptx', 'odp', 'key'], enabled: true, color: '#f6a0be', icon: 'presentation' },
  { id: 'fonts', name: 'Schriftarten', folder: 'Schriftarten', extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'], enabled: true, color: '#c4b9f8', icon: 'type' },
  { id: 'apps', name: 'Programme', folder: 'Programme', extensions: ['exe', 'msi', 'msix', 'msixbundle', 'apk', 'appx', 'dmg', 'deb', 'rpm'], enabled: true, color: '#9db6ec', icon: 'app' }
];

export function normalizedExtension(value) {
  return String(value || '').trim().toLowerCase().replace(/^\*?\./, '').replace(/[^a-z0-9+_-]/g, '');
}
export function validateFolder(folder) {
  const raw = String(folder || '').trim();
  if (!raw || raw === '.' || path.isAbsolute(raw) || /^[a-z]:/i.test(raw) || raw.startsWith('\\\\')) throw new Error('Zielordner muss ein relativer Ordnername sein.');
  const segments = raw.split(/[\\/]+/);
  if (segments.some(x => !x || x === '..' || x === '.' || /[<>:"|?*\x00-\x1f]/.test(x) || /[. ]$/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(x))) throw new Error(`Ungültiger Zielordner: ${raw}`);
  return segments.join(path.sep);
}
export function cleanRules(input) {
  if (!Array.isArray(input) || input.length > 60) throw new Error('Ungültige Regel-Liste (maximal 60).');
  const all = new Set();
  return input.map((rule, index) => {
    const folder = validateFolder(rule.folder);
    const extensions = [...new Set((Array.isArray(rule.extensions) ? rule.extensions : String(rule.extensions || '').split(/[,;\s]+/)).map(normalizedExtension).filter(Boolean))];
    if (extensions.length > 100) throw new Error('Zu viele Dateiendungen in einer Regel.');
    for (const ext of extensions) {
      if (all.has(ext) && rule.enabled !== false) throw new Error(`Die Dateiendung .${ext} ist mehrfach aktiv zugeordnet.`);
      if (rule.enabled !== false) all.add(ext);
    }
    return { id: String(rule.id || crypto.randomUUID()), name: String(rule.name || `Regel ${index + 1}`).slice(0, 55), folder, extensions, enabled: rule.enabled !== false, icon: String(rule.icon || 'folder'), color: /^#[0-9a-f]{6}$/i.test(rule.color) ? rule.color : '#b99aff' };
  });
}
export function ruleForFile(filePath, rules) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return (rules || []).find(x => x.enabled && x.extensions.includes(ext));
}
