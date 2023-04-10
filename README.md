# Backstage Provider Kubernetes
A Backstage plugin with entity providers to read Kubernetes objects as Backstage Entities.

## Getting started
### Installing The Plugin
You will have to add the provider in the catalog initialization code of your backend. They are not installed by default, therefore you have to add a dependency on @antoinedao/backstage-provider-kubernetes to your backend package.

```console
yarn add --cwd packages/backend @antoinedao/backstage-provider-kubernetes
```

And then add the entity provider to your catalog builder:


```ts title="packages/backend/src/plugins/catalog.ts"
/* highlight-add-next-line */
import { KubernetesEntityProvider } from '@antoinedao/backstage-provider-kubernetes';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);

  builder.addEntityProvider([
    ... await KubernetesEntityProvider.fromConfig(env, {
      logger: env.logger,
      scheduler: env.scheduler,
    })
  ])

  // ..
}
```

### Configuration
Configuring the Backstage Kubernetes provider is managed in Backstage's `app-config.yaml` file and involves two steps:

1. Defining remote Kubernetes cluster configuration and authentication methods. This re-uses the config definition for the [Backstage Kubernetes Plugin](https://backstage.io/docs/features/kubernetes/) which is documented [here](https://backstage.io/docs/features/kubernetes/configuration).
   > ⚠️ [`clusterLocatorMethod`](https://backstage.io/docs/features/kubernetes/configuration#clusterlocatormethods) of type `config` is the only tests method for no, other methods might not work or produce unexpected results 
   ```yaml
   kubernetes:
    serviceLocatorMethod:
      type: 'multiTenant'
    clusterLocatorMethods:
      - type: 'config'
        clusters:
          - url: https://127.0.0.1:6443
            name: docker-desktop
            authProvider: 'serviceAccount'
            skipTLSVerify: false
            skipMetricsLookup: true
            serviceAccountToken: ${K8S_DOCKER_DESKTOP_SA_TOKEN}
            caData: ${K8S_DOCKER_DESKTOP_CONFIG_CA_DATA}

          - url: https://33.33.33.33
            name: k8s-staging
            authProvider: googleServiceAccount
            skipTLSVerify: false
            skipMetricsLookup: true    
            caData: ${K8S_STAGING_CONFIG_CA_DATA}
   ```
2. Adding `kubernetes` configurations to the catalog providers configuration
    ```yaml
    catalog:
      rules:
        - allow: [Component, System, API, Resource, Location]
      providers:
        kubernetes:
          local-cluster:
            cluster: docker-desktop
            processor:
              namespaceOverride: default
              defaultOwner: guests
            schedule:
              frequency:
                seconds: 30
              timeout:
                seconds: 5

          staging:
            cluster: k8s-staging
            processor:
              namespaceOverride: default
              defaultOwner: guests
            filters:
              resources:
              - group: serving.knative.dev
                apiVersion: v1
                plural: services
                objectType: Service 
            schedule:
              frequency:
                minutes: 30
              timeout:
                minutes: 1
    ```

### Catalog Provider Configuration
This section covers in detail the configuration options for the catalog provider section. 

The Catalog Providers are defined in configuration file at the following path: `catalog.providers.kubernetes.<name-of-provider-config>`. Multiple concurrent providers are supported so you can import data from multiple clusters or within the same cluster with different processor overrides. 

The values for each key are objects with the following properties:

* `cluster` (required): a string that specifies the name of the Kubernetes cluster. It should match the name of the cluster inside the cluster locator methods defined in the global config at `kubernetes.clusterLocatorMethods.clusters.name`

* `filters` (optional): an optional object that contains properties for filtering resources.
  * `resources` (optional): property is an optional array of any type of data. The default configuration fetches `[deployments, jobs, cronjobs, statefulsets, daemonsets]`
  * `namespace` (optional): property is an optional string that specifies a namespace to filter for
  * `labelSelector` (optional): property is an optional string that specifies a label selector.

* `processor` (optional): an optional object that contains properties to populate required fields in the provided [Backtstage Components](https://backstage.io/docs/features/software-catalog/descriptor-format#kind-component)
  * `namespaceOverride`  (optional): set this to the [Backstage Namespace](https://backstage.io/docs/features/software-catalog/descriptor-format#namespace-optional) the Component should be assigned to. This will default to the Kubernetes object's `namespace` if left blank
  * `lifecyle` (optional): set this to specify the [Backstage Component Lifecycle](https://backstage.io/docs/features/software-catalog/descriptor-format#speclifecycle-required) property (defaults to `production`)
  * `defaultOwner` (optional): set this to specify the [Backstage Component Owner](https://backstage.io/docs/features/software-catalog/descriptor-format#specowner-required) property (defaults to `unknown`)
  
* `schedule` (optional): an optional object that contains properties for the schedule. The `TaskScheduleDefinitionConfig` interface is used to define the properties.
  * `frequency`: How often you want the task to run. The system does its best to avoid overlapping invocations.
  * `timeout`: The maximum amount of time that a single task invocation can take.
  * `initialDelay` (optional): The amount of time that should pass before the first invocation happens.
  * `scope` (optional): 'global' or 'local'. Sets the scope of concurrency control.

### Example

Here is a full example config for local development with Docker Desktop as a source:

```yaml
app:
  title: Scaffolded Backstage App
  baseUrl: http://localhost:3000

organization:
  name: My Company

backend:
  baseUrl: http://localhost:7007
  listen:
    port: 7007
  csp:
    connect-src: ["'self'", 'http:', 'https:']
  cors:
    origin: http://localhost:3000
    methods: [GET, HEAD, PATCH, POST, PUT, DELETE]
    credentials: true
  database:
    client: better-sqlite3
    connection: ':memory:'
  cache:
    store: memory

integrations:
  github:
    - host: github.com
      token: ${GITHUB_TOKEN}

techdocs:
  builder: 'local' # Alternatives - 'external'
  generator:
    runIn: 'docker' # Alternatives - 'local'
  publisher:
    type: 'local' # Alternatives - 'googleGcs' or 'awsS3'. Read documentation for using alternatives.

auth:
  providers: {}

scaffolder: {}

catalog:
  import:
    entityFilename: catalog-info.yaml
    pullRequestBranchName: backstage-integration
  rules:
    - allow: [Component, System, API, Resource, Location]
  providers:
    kubernetes:
      local-cluster:
        cluster: docker-desktop
        processor:
          namespaceOverride: default
          defaultOwner: guests
        schedule:
          frequency:
            seconds: 30
          timeout:
            seconds: 5
          
  locations: []

kubernetes:
  serviceLocatorMethod:
    type: 'multiTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - url: https://127.0.0.1:6443
          name: docker-desktop
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          skipMetricsLookup: true
          serviceAccountToken: eyJhbGciOiJSUzI1NiIsImtpZCI6Ik1QbVNBSWZic3VCaDRCcWNpZzg0X0FNT0dlZDhNNnpGQjZuR1FfTVRTbG8ifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJkZWZhdWx0Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZWNyZXQubmFtZSI6ImRlZmF1bHQtc2VjcmV0Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImRlZmF1bHQiLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIzNWVjNTA4Mi01MzlkLTQ1MDYtYTExYi01MmIxYTI5ZDI4ZmEiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6ZGVmYXVsdDpkZWZhdWx0In0.ovf5WTpl-_xxOQxbvKFnNlBITFDMKBVvrP6e0ig9gCmWvj0ck_euEYdtBcddPCXeHWHqaW-OH6RtWiqlFStvND11uyK3tyLVUMZKyay2oERg0VHxxjnaGwwHVbMnUr_1D6aZXhj7BZ5zyibbxlhgq4l2uWHQKzYIBU5tprtnIRJsVj3fLApsMMX81zRfI7AaNhxkdaNQeIeEYbFhDdWtnkc2hN-_ZpkmoXrjRt_Ri7iepg6x01pqC4R9w-jZ3tr9Rj-jt3Lv59Mtwxli4OQWEekuWNYsUdP4sefzD7FrjnLD3sSwyzrMD9-fzwMaxfonaA3p1S8cBNxbDeJ3PgjVtw
          caData: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUMvakNDQWVhZ0F3SUJBZ0lCQURBTkJna3Foa2lHOXcwQkFRc0ZBREFWTVJNd0VRWURWUVFERXdwcmRXSmwKY201bGRHVnpNQjRYRFRJek1EUXdOVEl4TVRrMU9Wb1hEVE16TURRd01qSXhNVGsxT1Zvd0ZURVRNQkVHQTFVRQpBeE1LYTNWaVpYSnVaWFJsY3pDQ0FTSXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnRVBBRENDQVFvQ2dnRUJBTWZnCmVnZDQ5Z2w4UlRPOGhleFFwSlMwU1BKbVZLQ2lNZ1hSSzUvVWhLVXlTQWxDa3dDWlhnSG1HUUpTcklxR0VENmcKbHErREUveHJDSDZrcVYvWXFhVUZFMFB1cUhTdStMTjRqQiswbFNldVZYYWR5NWtvc1BUenpwQ1NKSnVrSGc2VwpBU21EV0t5OGpEZ3EyTW93RDhUTy84K1FvL05oSWg3eGlmUVN2VTFLdzVDbEtlUU13ZmZ6SHRzSUIwS2NiQ05kCnBEekF3dUlLMTVuaElZYy9jNmJmeDFQTVBldkxvM0d1Z25WZTJZR3cvTUJpY1A2NFFlVTBzTzBaVjRmVUR1d2QKV1pYTlBWdDlINkdXaFpjTFQxOU5JVzBRb1NMNk1jcERRUk1VNG1MMXR6Ris0WW5EOE50d3J5d2lHUE0zcExSeApmNE56emlxNTAzOThLNFdrcU5rQ0F3RUFBYU5aTUZjd0RnWURWUjBQQVFIL0JBUURBZ0trTUE4R0ExVWRFd0VCCi93UUZNQU1CQWY4d0hRWURWUjBPQkJZRUZHUXNqcUp0OWhyY0dUYmVqV0RmTFp0bU82ZUlNQlVHQTFVZEVRUU8KTUF5Q0NtdDFZbVZ5Ym1WMFpYTXdEUVlKS29aSWh2Y05BUUVMQlFBRGdnRUJBSVNESHphbjZ0SUFOQWZDRVBhegowVEJjRUsxeXV2cnpvNEdXYVlWaWpxSWhPMzNEZzVJUDhzT2t5cXRSZVJSZE9HQ0tMZmlRNlRrWXB5YmEwa2ZhClBWaVR1WHdaNk9qVG56RTB4czR6UWdQY1hIVzdEQW9aTlN5ZzZYR2ZreDhaVDRZNUVYd09MaWZsN0Y1MzRPc3EKQ2g0RmVDWDRDTEVFQndybEpINkJsTTVFdzZ1M1VmR2RrRWhKU3BNdk9QRWFjT0JocEpCem9jazVTM1U2NWlXcQpKU1d4UDNWdUxlU28xcTNGWWpxQmM5UzFmeko0WWpFRG1NMmZFU2pWdnZYYkFLQzUrbCtiVjFLMWE4ZDlXcnRCCms1czZKZndFaWpYZGxGbldoelJ6QVVVZVN3K2wxRUdMQnpMbENUN0dLUGlXWTdhc1pZckZmQzJua1dXNDFPVGsKbDZvPQotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==
```
