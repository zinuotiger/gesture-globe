import path from 'node:path';

const dependencies = {
  app: [
    'globe',
    'camera',
    'vision',
    'gesture',
    'interaction',
    'geo',
    'ui',
    'config',
    'diagnostics',
    'shared',
  ],
  globe: ['config', 'shared'],
  camera: ['config', 'shared'],
  vision: ['config', 'shared'],
  workers: ['vision', 'config', 'shared'],
  gesture: ['config', 'shared'],
  interaction: ['globe', 'geo', 'config', 'diagnostics', 'shared'],
  geo: ['globe', 'config', 'shared'],
  ui: ['app', 'shared'],
  config: ['shared'],
  diagnostics: ['shared'],
  shared: [],
  qa: ['shared'],
  agent: ['interaction', 'geo', 'config', 'shared'],
};

export function importViolation(filename, specifier) {
  const root = path.resolve('src');
  const source = path.relative(root, filename).split(path.sep);
  if (source[0] === '..') return null;
  const owner = source[0];
  if (!specifier.startsWith('.')) {
    if (specifier.startsWith('three') && !['globe', 'geo'].includes(owner))
      return 'Three.js belongs to Globe/Geo.';
    if (
      specifier.startsWith('@mediapipe/') &&
      !['vision', 'workers'].includes(owner)
    )
      return 'MediaPipe belongs to Vision.';
    if (owner === 'gesture' && specifier.startsWith('node:'))
      return 'Gesture must remain browser-independent pure logic.';
    if (!['three', '@mediapipe/'].some((name) => specifier.startsWith(name)))
      return 'Undeclared external or alias import; add an explicit boundary policy first.';
    return null;
  }
  const target = path
    .relative(root, path.resolve(path.dirname(filename), specifier))
    .split(path.sep);
  if (target[0] === '..') return 'Runtime modules cannot import outside src.';
  if (owner === target[0]) return null;
  if (owner === 'main.ts') {
    if (specifier === './ui/styles.css' || specifier === './app/index.ts')
      return null;
    return 'main.ts composes the App public entry only.';
  }
  if (!dependencies[owner]?.includes(target[0]))
    return `Forbidden dependency ${owner} -> ${target[0]}.`;
  if (target.length !== 2 || target[1] !== 'index.ts')
    return 'Cross-module imports must use the public index.ts.';
  return null;
}

export const boundaries = {
  rules: {
    imports: {
      meta: {
        type: 'problem',
        schema: [],
        messages: { violation: '{{reason}}' },
      },
      create(context) {
        const inspect = (node) => {
          if (!node.source) return;
          const reason =
            typeof node.source.value === 'string'
              ? importViolation(context.filename, node.source.value)
              : 'Dynamic imports must have a statically auditable path.';
          if (reason)
            context.report({ node, messageId: 'violation', data: { reason } });
        };
        return {
          ImportDeclaration: inspect,
          ExportNamedDeclaration: inspect,
          ExportAllDeclaration: inspect,
          ImportExpression: inspect,
        };
      },
    },
  },
};
