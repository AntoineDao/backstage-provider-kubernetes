import { ConfigReader } from '@backstage/config';
import { readProviderConfigs, DEFAULT_OBJECTS } from './KubernetesEntityProviderConfig';

describe('readProviderConfigs', () => {
  it('returns an empty array if providersConfig is missing', () => {
    const config = new ConfigReader({});
    const result = readProviderConfigs(config);
    expect(result).toEqual([]);
  });

  it('sets sane defaults', () => {
    expect(DEFAULT_OBJECTS).not.toEqual([])
    const config = new ConfigReader({
      catalog: {
        providers: {
          kubernetes: {
            provider1: {
              cluster: 'cluster1',
            }
          }
        }
      }
    });

    const result = readProviderConfigs(config);

    expect(result).toEqual([
      {
        id: 'provider1',
        cluster: 'cluster1',
        filters: {
          resources: DEFAULT_OBJECTS
        },
        processor: {
          defaultOwner: 'unknown',
          lifecycle: 'production',
          namespaceOverride: undefined,
        },
        schedule: undefined,
      }
    ]);
  })

  it('returns an array of KubernetesEntityProviderConfig objects if providersConfig is present', () => {

    const config = new ConfigReader({
      catalog: {
        providers: {
          kubernetes: {
            provider1: {
              cluster: 'cluster1',
              filters: {
                resources: [
                  {
                    group: 'apps',
                    apiVersion: 'v1',
                    plural: 'deployments',
                    objectType: 'deployments',
                  },
                ],
                namespace: 'ns1',
                labelSelector: 'app=my-app',
              },
              processor: {
                defaultOwner: 'owner1',
                lifecycle: 'dev',
                namespaceOverride: undefined,
              },
              schedule: {
                frequency: { cron: '0 0 * * ? *' },
                timeout: { seconds: 30 },
                initialDelay: { seconds: 300 },
                scope: 'global'
              }
            },
            provider2: {
              cluster: 'cluster2',
              filters: {
                resources: [
                  {
                    group: 'apps',
                    apiVersion: 'v1',
                    plural: 'statefulsets',
                    objectType: 'statefulsets',
                  },
                ],
                namespace: undefined,
                labelSelector: undefined,
              },
              processor: {
                defaultOwner: 'owner2',
                lifecycle: 'prod',
                namespaceOverride: 'ns2',
              },
              schedule: undefined,
            },
          }
        }
      }
    });

    const result = readProviderConfigs(config);

    expect(result).toEqual([
      {
        id: 'provider1',
        cluster: 'cluster1',
        filters: {
          resources: [
            {
              group: 'apps',
              apiVersion: 'v1',
              plural: 'deployments',
              objectType: 'deployments',
            },
          ],
          namespace: 'ns1',
          labelSelector: 'app=my-app',
        },
        processor: {
          defaultOwner: 'owner1',
          lifecycle: 'dev',
          namespaceOverride: undefined,
        },
        schedule: {
          frequency: { cron: '0 0 * * ? *' },
          timeout: { seconds: 30 },
          initialDelay: { seconds: 300 },
          scope: 'global'
        },
      },
      {
        id: 'provider2',
        cluster: 'cluster2',
        filters: {
          resources: [
            {
              group: 'apps',
              apiVersion: 'v1',
              plural: 'statefulsets',
              objectType: 'statefulsets',
            },
          ],
          namespace: undefined,
          labelSelector: undefined,
        },
        processor: {
          defaultOwner: 'owner2',
          lifecycle: 'prod',
          namespaceOverride: 'ns2',
        },
        schedule: undefined,
      },
    ]);
  });
});
