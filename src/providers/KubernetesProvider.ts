import * as winston from 'winston';
import _ from 'lodash';
import * as uuid from 'uuid';
import { V1ObjectMeta } from '@kubernetes/client-node';
import { PluginTaskScheduler, TaskRunner } from '@backstage/backend-tasks';
import {
  KubernetesBuilder,
  ClusterDetails,
  KubernetesAuthTranslatorGenerator,
  KubernetesFetcher,
} from "@backstage/plugin-kubernetes-backend"
import { KubernetesEntityProviderConfig, readProviderConfigs } from "./KubernetesEntityProviderConfig"
import { Logger } from 'winston';
import { Config } from '@backstage/config';
import {
  DeferredEntity,
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

type KubernetesEnvironment = {
  logger: Logger;
  config: Config;
};

export class KubernetesEntityProvider implements EntityProvider {
  private readonly clusterDetails: ClusterDetails;
  private readonly providerConfig: KubernetesEntityProviderConfig
  private readonly scheduleFn: () => Promise<void>;
  private readonly fetcher: KubernetesFetcher

  private readonly logger: winston.Logger

  private connection?: EntityProviderConnection;

  static async fromConfig(
    env: KubernetesEnvironment,
    options: {
      logger: winston.Logger;
      schedule?: TaskRunner;
      scheduler?: PluginTaskScheduler;
    },
  ): Promise<KubernetesEntityProvider[]> {
    // @ts-ignore
    const builder = new KubernetesBuilder(env)
    const { clusterSupplier, fetcher } = await builder.build()
    const clusters = await clusterSupplier.getClusters()
    const clusterMap = _.mapValues(_.keyBy(clusters, 'name'))
    return readProviderConfigs(env.config).map((p) => {
      const clusterConfig = clusterMap[p.cluster]

      if (!clusterConfig) {
        throw Error(
          `Error while processing Kubernetes provider config. The cluster ${p.cluster} does not exist in the Kubernetes config.`
        )
      }

      const taskRunner =
        options.schedule ??
        options.scheduler!.createScheduledTaskRunner(p.schedule!);

      return new KubernetesEntityProvider(
        clusterConfig,
        p,
        taskRunner,
        options.logger,
        fetcher,
      )
    })
  }

  constructor(
    clusterDetails: ClusterDetails,
    providerConfig: KubernetesEntityProviderConfig,
    taskRunner: TaskRunner,
    logger: winston.Logger,
    fetcher: KubernetesFetcher,
  ) {
    this.clusterDetails = clusterDetails
    this.providerConfig = providerConfig
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.scheduleFn = this.createScheduleFn(taskRunner);
    this.fetcher = fetcher

  }

  getProviderName(): string {
    return `kubernetes-provider-${this.providerConfig.id}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    return await this.scheduleFn();
  }

  private createScheduleFn(taskRunner: TaskRunner): () => Promise<void> {
    return async () => {
      const taskId = `${this.getProviderName()}:refresh`;
      return taskRunner.run({
        id: taskId,
        fn: async () => {
          const logger = this.logger.child({
            class: KubernetesEntityProvider.prototype.constructor.name,
            taskId,
            taskInstanceId: uuid.v4(),
          });
          try {
            await this.refresh(logger);
          } catch (error) {
            logger.error(`${this.getProviderName()} refresh failed`, error);
          }
        },
      });
    };
  }

  async refresh(logger: winston.Logger) {
    if (!this.connection) {
      throw new Error('Not initialized');
    }

    const clusterDetails = await this.decorateDetailsWithAuth()
    const objectTypesToFetch = new Set(this.providerConfig.filters.resources);
    const results = await this.fetcher.fetchObjectsForService({
      serviceId: '',
      customResources: [],
      clusterDetails,
      objectTypesToFetch,
      // Slight hack to prevent underlying function from setting `backstage.io/kubernetes-id=${params.serviceId}
      labelSelector: this.providerConfig.filters.labelSelector ?? ' ',
      namespace: this.providerConfig.filters.namespace,
    })

    results.errors.forEach((error) => {
      this.logger.error(`Failed to fetch objects from cluster`, error)
    })
    const entities = results.responses.map(({ resources, type }) => (
      resources.map((resource) => this.toEntity(resource, type))
    )).flat()

    await this.connection.applyMutation({
      type: 'full',
      entities
    })

    logger.info(
      `Read ${entities.length} Kubernetes resources`,
    );
  }

  private toEntity(resource: any, resourceType: string): DeferredEntity {
    const metadata = resource.metadata as V1ObjectMeta
    return {
      locationKey: this.getProviderName(),
      entity: {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: metadata.name as string,
          namespace: this.providerConfig.processor.namespaceOverride ?? metadata.namespace,
          annotations: {
            ...metadata.annotations,
            'backstage.io/managed-by-location': `url:https://${this.getProviderName()}`,
            'backstage.io/managed-by-origin-location': `url:https://${this.getProviderName()}`,
          },
          labels: metadata.labels
        },
        spec: {
          type: resourceType,
          lifecycle: this.providerConfig.processor.lifecycle,
          owner: this.providerConfig.processor.defaultOwner,
        }
      }
    }
  }

  private async decorateDetailsWithAuth() {
    const translator = KubernetesAuthTranslatorGenerator.getKubernetesAuthTranslatorInstance(
      this.clusterDetails.authProvider, { logger: this.logger }
    )

    return await translator.decorateClusterDetailsWithAuth(this.clusterDetails, {})
  }

}
