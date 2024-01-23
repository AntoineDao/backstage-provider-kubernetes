import { TaskScheduleDefinitionConfig } from '@backstage/backend-tasks';

export interface Config {
    catalog?: {
        providers?: {
            kubernetes?: {
              [key: string]: {
                cluster: string;
                filters?: {
                  resources?: Array<any>;
                  namespace?: string;
                  labelSelector?: string;
                };
                processor?: {
                  namespaceOverride?: string;
                  lifecyle?: string;
                  defaultOwner?: string;
                };
                schedule?: TaskScheduleDefinitionConfig;
              };
            }
        };
    };
}
