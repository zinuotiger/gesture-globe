/** UI emits the selected value; application wiring owns the action. */
export function qualityControl(
  document: Document,
  initial: string,
  onChange: (value: string) => void,
) {
  const label = document.createElement('label');
  label.className = 'quality-control';
  label.textContent = '画质 ';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '画质');
  for (const [value, text] of [
    ['AUTO', '自动'],
    ['LOW', '低'],
    ['MEDIUM', '中'],
    ['HIGH', '高'],
  ]) {
    const option = document.createElement('option');
    option.value = value!;
    option.textContent = text!;
    select.append(option);
  }
  select.value = initial;
  const changed = () => onChange(select.value);
  select.addEventListener('change', changed);
  label.append(select);
  const effective = document.createElement('span');
  label.append(effective);
  return {
    element: label,
    update(value: string, actual?: string) {
      select.value = value;
      const names: Record<string, string> = {
        LOW: '低',
        MEDIUM: '中',
        HIGH: '高',
      };
      effective.textContent =
        value === 'AUTO' && actual ? `（当前${names[actual] ?? actual}）` : '';
    },
    dispose() {
      select.removeEventListener('change', changed);
      label.remove();
    },
  };
}
