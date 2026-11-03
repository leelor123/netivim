import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'android', 'node_modules', '.claude', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Element', property: 'innerHTML', message: 'Use textContent / DOM APIs (security baseline).' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "AssignmentExpression[left.property.name='innerHTML']", message: 'Never assign innerHTML; use textContent / DOM APIs.' },
        { selector: "NewExpression[callee.object.name='THREE'][callee.property.name='Clock']", message: 'Use THREE.Timer, not Clock.' },
        { selector: "CallExpression[callee.name='requestAnimationFrame']", message: 'Use renderer.setAnimationLoop.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['three/examples/jsm/*'], message: 'Import from three/addons/... instead.' }] },
      ],
    },
  },
);
