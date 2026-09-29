import { loadConfig } from '../config/index.ts';
import type { AppConfig, ConfigIssue } from '../config/index.ts';
import { mountRuntime } from './mountRuntime.ts';
import type { AgentPort } from '../interaction/index.ts';

export interface AppRuntime {
  config: Readonly<AppConfig>;
  configIssues: readonly ConfigIssue[];
  agentPort?: AgentPort;
  dispose(): void;
}

/** Camera and inference are never started here. */
export function bootstrapApp(
  root: HTMLElement | null,
  rawConfig?: unknown,
  mount: typeof mountRuntime = mountRuntime,
): AppRuntime {
  if (!root) throw new Error('Gesture Globe requires an application root.');
  const { config, issues } = loadConfig(rawConfig);
  root.dataset.appPhase = 'BOOT';
  const scene = mount(root, config);
  let disposed = false;
  return {
    config,
    configIssues: issues,
    ...(scene.agentPort ? { agentPort: scene.agentPort } : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.dispose();
      root.dataset.appPhase = 'DISPOSING';
    },
  };
}
