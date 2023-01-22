import {
  readTaskScheduleDefinitionFromConfig,
  TaskScheduleDefinition,
} from '@backstage/backend-tasks';
import { Config } from '@backstage/config';
import {
  ObjectToFetch
} from '@backstage/plugin-kubernetes-backend';

const DEFAULT_OWNER = 'unknown';
const DEFAULT_LIFECYCLE = 'production'
export const DEFAULT_OBJECTS: ObjectToFetch[] = [
  {
    group: 'apps',
    apiVersion: 'v1',
    plural: 'deployments',
    objectType: 'deployments',
  },
  {
    group: 'batch',
    apiVersion: 'v1',
    plural: 'jobs',
    objectType: 'jobs',
  },
  {
    group: 'batch',
    apiVersion: 'v1',
    plural: 'cronjobs',
    objectType: 'cronjobs',
  },
  {
    group: 'apps',
    apiVersion: 'v1',
    plural: 'statefulsets',
    objectType: 'statefulsets',
  },
  {
    group: 'apps',
    apiVersion: 'v1',
    plural: 'daemonsets',
    objectType: 'daemonsets',
  },
];

export type KubernetesEntityProviderConfig = {
  id: string;
  cluster: string;
  filters: {
    resources: ObjectToFetch[]
    namespace?: string
    labelSelector?: string
  };
  processor: {
    defaultOwner: string
    lifecycle: string
    namespaceOverride?: string
  };
  schedule?: TaskScheduleDefinition;
};

export function readProviderConfigs(
  config: Config
): KubernetesEntityProviderConfig[] {
  const providersConfig = config.getOptionalConfig('catalog.providers.kubernetes');
  if (!providersConfig) {
    return [];
  }

  return providersConfig.keys().map(id => {
    const providerConfig = providersConfig.getConfig(id);
    return readProviderConfig(id, providerConfig);
  });
}

function readProviderConfig(
  id: string,
  config: Config,
): KubernetesEntityProviderConfig {

  const cluster = config.getString('cluster');

  const resources = config.getOptionalConfigArray('filters.resources') as unknown as ObjectToFetch[] ?? DEFAULT_OBJECTS;
  const namespace = config.getOptionalString('filters.namespace');
  const labelSelector = config.getOptionalString('filters.labelSelector');

  const namespaceOverride = config.getOptionalString('processor.namespaceOverride');
  const defaultOwner = config.getOptionalString('processor.defaultOwner') ?? DEFAULT_OWNER;
  const lifecycle = config.getOptionalString('processor.lifecycle') ?? DEFAULT_LIFECYCLE
  const schedule = config.has('schedule')
    ? readTaskScheduleDefinitionFromConfig(config.getConfig('schedule'))
    : undefined;

  return {
    id,
    cluster,
    filters: {
      resources,
      namespace,
      labelSelector,
    },
    processor: {
      namespaceOverride,
      lifecycle,
      defaultOwner,
    },
    schedule,
  };
}
