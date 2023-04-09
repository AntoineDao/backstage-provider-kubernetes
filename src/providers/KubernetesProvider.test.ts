import { KubernetesEntityProvider } from "./KubernetesProvider";

describe('KubernetesEntityProvider', () => {
    let provider: KubernetesEntityProvider;
    // @ts-ignore
    const mockLogger = { info: jest.fn(), error: jest.fn(), child: jest.fn(() => mockLogger) };
    const mockTaskRunner = { run: jest.fn() };
    const mockFetcher = { fetchObjectsForService: jest.fn(() => ({ responses: [], errors: [] })) };

    beforeEach(async () => {
        provider = new KubernetesEntityProvider(
            {
                name: 'test-cluster',
                url: 'https://test-cluster',
                authProvider: 'serviceAccount',
            },
            {
                id: 'test-provider',
                cluster: 'test-cluster',
                filters: {
                    namespace: 'default',
                    resources: [
                        {
                            group: 'apps',
                            apiVersion: 'v1',
                            plural: 'deployments',
                            objectType: 'deployments',
                        },
                    ],
                },
                processor: {
                    defaultOwner: 'default-owner',
                    namespaceOverride: 'test-namespace',
                    lifecycle: 'production',
                },
            },
            mockTaskRunner,
            mockLogger as any,
            mockFetcher as any,
        );
        // @ts-ignore
        provider.connection = { applyMutation: jest.fn() } as any;
    });

    afterEach(() => jest.resetAllMocks());

    describe('refresh', () => {
        it('throws an error if connection is not initialized', async () => {
            // @ts-ignore
            provider.connection = undefined;

            await expect(provider.refresh(mockLogger as any)).rejects.toThrowError('Not initialized');
        });

        it('fetches objects and converts them to entities', async () => {
            const mockResponse = {
                responses: [
                    { resources: [{ metadata: { name: 'test-pod' } }], type: 'pods' },
                    { resources: [{ metadata: { name: 'test-deployment' } }], type: 'deployments' },
                ],
                errors: [],
            };
            // @ts-ignore
            mockFetcher.fetchObjectsForService.mockResolvedValueOnce(mockResponse);

            await provider.refresh(mockLogger as any);

            expect(mockFetcher.fetchObjectsForService).toHaveBeenCalledWith({
                serviceId: '',
                customResources: [],
                clusterDetails: {
                    name: 'test-cluster',
                    url: 'https://test-cluster',
                    authProvider: 'serviceAccount',
                },
                objectTypesToFetch: new Set([
                    {
                        group: 'apps',
                        apiVersion: 'v1',
                        plural: 'deployments',
                        objectType: 'deployments',
                    },
                ]),
                labelSelector: ' ',
                namespace: 'default',
            });

            // @ts-ignore
            expect(provider.connection?.applyMutation).toHaveBeenCalledWith({
                type: 'full',
                entities: [
                    {
                        locationKey: 'kubernetes-provider-test-provider',
                        entity: {
                            apiVersion: 'backstage.io/v1alpha1',
                            kind: 'Component',
                            metadata: {
                                name: 'test-pod',
                                namespace: 'test-namespace',
                                annotations: {
                                    'backstage.io/managed-by-location': 'url:https://kubernetes-provider-test-provider',
                                    'backstage.io/managed-by-origin-location': 'url:https://kubernetes-provider-test-provider',
                                },
                            },
                            spec: {
                                type: 'pods',
                                lifecycle: 'production',
                                owner: 'default-owner',
                            },
                        },
                    },
                    {
                        locationKey: 'kubernetes-provider-test-provider',
                        entity: {
                            apiVersion: 'backstage.io/v1alpha1',
                            kind: 'Component',
                            metadata: {
                                name: 'test-deployment',
                                namespace: 'test-namespace',
                                annotations: {
                                    'backstage.io/managed-by-location': 'url:https://kubernetes-provider-test-provider',
                                    'backstage.io/managed-by-origin-location': 'url:https://kubernetes-provider-test-provider',
                                }
                            },
                            spec: {
                                lifecycle: 'production',
                                owner: 'default-owner',
                                type: 'deployments'
                            }
                        }
                    }]
            })
        })
    })
})
