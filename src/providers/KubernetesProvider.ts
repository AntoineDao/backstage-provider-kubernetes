import * as winston from 'winston';
import _ from 'lodash';
import * as uuid from 'uuid';
import { V1ObjectMeta } from '@kubernetes/client-node';
import { PluginTaskScheduler, TaskRunner } from '@backstage/backend-tasks';
import { DeferredEntity, EntityProvider, EntityProviderConnection } from "@backstage/plugin-catalog-backend";
import { KubernetesBuilder, KubernetesEnvironment, ClusterDetails, KubernetesAuthTranslatorGenerator } from "@backstage/plugin-kubernetes-backend"
import { KubernetesClient } from "../service/KubernetesClient";
import { KubernetesEntityProviderConfig } from "./KubernetesEntityProviderConfig"

export class KubernetesEntityProvider implements EntityProvider {
  private readonly clusterDetails: ClusterDetails;
  private readonly providerConfig: KubernetesEntityProviderConfig
  private readonly scheduleFn: () => Promise<void>;

  private readonly logger: winston.Logger

  private connection?: EntityProviderConnection;

  static async fromConfig(
    env: KubernetesEnvironment,
    providerConfigs: KubernetesEntityProviderConfig[],
    options: {
      logger: winston.Logger;
      schedule?: TaskRunner;
      scheduler?: PluginTaskScheduler;
    },
  ): Promise<KubernetesEntityProvider[]> {
    const builder = new KubernetesBuilder(env)
    const { clusterSupplier } = await builder.build()

    const clusters = await clusterSupplier.getClusters()
    const clusterMap = _.mapValues(_.keyBy(clusters, 'name'))

    return providerConfigs.map((p) => {
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
      )
    })
  }

  constructor(
    clusterDetails: ClusterDetails,
    providerConfig: KubernetesEntityProviderConfig,
    taskRunner: TaskRunner,
    logger: winston.Logger,
  ) {
    this.clusterDetails = clusterDetails
    this.providerConfig = providerConfig
    this.logger = logger.child({
      target: this.getProviderName(),
    });
    this.scheduleFn = this.createScheduleFn(taskRunner);

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

    const client = new KubernetesClient({ logger: this.logger })
    const clusterDetails = await this.decorateDetailsWithAuth()
    const results = await Promise.all(this.providerConfig.filters.resources.map((objectTypeToFetch) =>
      client.fetchResources(
        {
          clusterDetails,
          objectTypeToFetch,
          labelSelector: this.providerConfig.filters.labelSelector,
          namespace: this.providerConfig.filters.namespace,
        }
      )
    ))

    const entities = results.map((result) => {
      if (result.error) {
        this.logger.error(`Failed to fetch objects from cluster`, result.error)
      }

      return result.response.resources.map((resource) => this.toEntity(resource, result.response.type))
    }).flat()

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
          annotations: metadata.annotations,
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
