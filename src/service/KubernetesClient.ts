/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Config,
  Cluster,
  KubeConfig,
  User,
  bufferFromFileOrString,
} from '@kubernetes/client-node';
import lodash, { Dictionary } from 'lodash';
import { Logger } from 'winston';
import {
  ClusterDetails,
  FetchResponseWrapper,
  ObjectToFetch
} from '@backstage/plugin-kubernetes-backend';
import {
  FetchResponse,
  KubernetesFetchError,
  KubernetesErrorTypes,
} from '@backstage/plugin-kubernetes-common';
import fetch, { RequestInit, Response } from 'node-fetch';
import * as https from 'https';
import fs from 'fs-extra';

export interface KubernetesClientBasedFetcherOptions {
  logger: Logger;
}

// export type FetchResult = FetchResponse | KubernetesFetchError;
export type FetchResult = {
  response: FetchResponse;
  error?: KubernetesFetchError
}


const statusCodeToErrorType = (statusCode: number): KubernetesErrorTypes => {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED_ERROR';
    case 404:
      return 'NOT_FOUND';
    case 500:
      return 'SYSTEM_ERROR';
    default:
      return 'UNKNOWN_ERROR';
  }
};

type FetchObjectsParams = {
  clusterDetails: ClusterDetails;
  objectTypeToFetch: ObjectToFetch;
  labelSelector?: string;
  namespace?: string;
}

export class KubernetesClient {
  private readonly logger: Logger;

  constructor({ logger }: KubernetesClientBasedFetcherOptions) {
    this.logger = logger;
  }

  fetchResources(
    params: FetchObjectsParams
  ): Promise<FetchResult> {
    return this.fetchResource(
      params.clusterDetails,
      params.objectTypeToFetch.group,
      params.objectTypeToFetch.apiVersion,
      params.objectTypeToFetch.plural,
      params.namespace,
      params.labelSelector
    ).then(
      (r: Response): Promise<FetchResult> =>
        r.ok
          ? r.json().then(
            ({ items }): FetchResult => ({
              response: {
                type: params.objectTypeToFetch.objectType,
                resources: items,
              },
            }),
          )
          : {
            response: {
              type: 'pods',
              resources: []
            },
            error: this.handleUnsuccessfulResponse(params.clusterDetails.name, r)
          },
    )

  }


  private async handleUnsuccessfulResponse(
    clusterName: string,
    res: Response,
  ): Promise<KubernetesFetchError> {
    const resourcePath = new URL(res.url).pathname;
    this.logger.warn(
      `Received ${res.status
      } status when fetching "${resourcePath}" from cluster "${clusterName}"; body=[${await res.text()}]`,
    );
    return {
      errorType: statusCodeToErrorType(res.status),
      statusCode: res.status,
      resourcePath,
    };
  }

  private fetchResource(
    clusterDetails: ClusterDetails,
    group: string,
    apiVersion: string,
    plural: string,
    namespace?: string,
    labelSelector?: string,
  ): Promise<Response> {
    const encode = (s: string) => encodeURIComponent(s);
    let resourcePath = group
      ? `/apis/${encode(group)}/${encode(apiVersion)}`
      : `/api/${encode(apiVersion)}`;
    if (namespace) {
      resourcePath += `/namespaces/${encode(namespace)}`;
    }
    resourcePath += `/${encode(plural)}`;

    let url: URL;
    let requestInit: RequestInit;
    if (clusterDetails.serviceAccountToken) {
      [url, requestInit] = this.fetchArgsFromClusterDetails(clusterDetails);
    } else if (fs.pathExistsSync(Config.SERVICEACCOUNT_TOKEN_PATH)) {
      [url, requestInit] = this.fetchArgsInCluster();
    } else {
      return Promise.reject(
        new Error(
          `no bearer token for cluster '${clusterDetails.name}' and not running in Kubernetes`,
        ),
      );
    }

    if (url.pathname === '/') {
      url.pathname = resourcePath;
    } else {
      url.pathname += resourcePath;
    }

    if (labelSelector) {
      url.search = `labelSelector=${labelSelector}`;
    }

    return fetch(url, requestInit);
  }

  private fetchArgsFromClusterDetails(
    clusterDetails: ClusterDetails,
  ): [URL, RequestInit] {
    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clusterDetails.serviceAccountToken}`,
      },
    };

    const url: URL = new URL(clusterDetails.url);
    if (url.protocol === 'https:') {
      requestInit.agent = new https.Agent({
        ca:
          bufferFromFileOrString(
            clusterDetails.caFile,
            clusterDetails.caData,
          ) ?? undefined,
        rejectUnauthorized: !clusterDetails.skipTLSVerify,
      });
    }
    return [url, requestInit];
  }
  private fetchArgsInCluster(): [URL, RequestInit] {
    const kc = new KubeConfig();
    kc.loadFromCluster();
    // loadFromCluster is guaranteed to populate the cluster/user/context
    const cluster = kc.getCurrentCluster() as Cluster;
    const user = kc.getCurrentUser() as User;

    const token = fs.readFileSync(user.authProvider.config.tokenFile);

    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    const url = new URL(cluster.server);
    if (url.protocol === 'https:') {
      requestInit.agent = new https.Agent({
        ca: fs.readFileSync(cluster.caFile as string),
      });
    }
    return [url, requestInit];
  }
}
