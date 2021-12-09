import {
  ServiceInstance,
  ServiceListInstance,
  ServiceListInstanceCreateOptions,
} from 'twilio/lib/rest/serverless/v1/service';
import { BuildInstance, BuildListInstanceCreateOptions } from 'twilio/lib/rest/serverless/v1/service/build';
import { TwilioApiError, Logger } from 'flex-dev-utils';
import { EnvironmentInstance } from 'twilio/lib/rest/serverless/v1/service/environment';

interface FileVersion {
  path: string;
  sid: string;
}

interface BuildEnvironment {
  build?: BuildInstance;
  environment?: EnvironmentInstance;
}

/**
 * Wrapper Twilio Serverless Public API
 */
export default class ServerlessClient {
  public static NewService: ServiceListInstanceCreateOptions = {
    uniqueName: 'default',
    friendlyName: 'Flex Plugins Service (Autogenerated) - Do Not Delete',
  };

  static timeoutMsec = 30000;

  static pollingIntervalMsec = 500;

  private client: ServiceListInstance;

  private logger: Logger;

  constructor(client: ServiceListInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Returns a service instance
   * @param serviceSid
   */
  async getService(serviceSid: string): Promise<ServiceInstance> {
    return this.client.get(serviceSid).fetch();
  }

  /**
   * Lists all services
   */
  async listServices(): Promise<ServiceInstance[]> {
    return this.client.list();
  }

  /**
   * Creates a service instance
   */
  async getOrCreateDefaultService(): Promise<ServiceInstance> {
    const list = await this.listServices();
    const service = list.find((i) => i.uniqueName === ServerlessClient.NewService.uniqueName);
    if (service) {
      return service;
    }

    return this.client.create(ServerlessClient.NewService);
  }

  /**
   * Updates the service name
   * @param serviceSid  the service sid to update
   */
  async updateServiceName(serviceSid: string): Promise<ServiceInstance> {
    const service = await this.client.get(serviceSid).fetch();
    service.friendlyName = ServerlessClient.NewService.friendlyName;

    return service.update();
  }

  /**
   * Determines if the given plugin has a legacy (v0.0.0) bundle
   * @param serviceSid  the service sid
   * @param pluginName  the plugin name
   */
  async hasLegacy(serviceSid: string, pluginName: string): Promise<boolean> {
    const { build } = await this.getBuildAndEnvironment(serviceSid, pluginName);
    if (!build) {
      return false;
    }

    return Boolean(this.getLegacyAsset(build, pluginName));
  }

  /**
   * Removes the legacy bundle (v0.0.0)
   * @param serviceSid  the service sid
   * @param pluginName  the plugin name
   */
  async removeLegacy(serviceSid: string, pluginName: string): Promise<void> {
    const { build, environment } = await this.getBuildAndEnvironment(serviceSid, pluginName);
    if (!build || !environment) {
      return;
    }
    if (!this.getLegacyAsset(build, pluginName)) {
      return;
    }

    const assets = build.assetVersions
      .map((asset) => asset as FileVersion)
      .filter((asset) => !asset.path.includes(`/plugins/${pluginName}/0.0.0/bundle.js`))
      .map((asset) => asset.sid);
    const functions = build.functionVersions.map((func) => func as FileVersion).map((func) => func.sid);
    const request: BuildListInstanceCreateOptions = {
      assetVersions: assets,
      functionVersions: functions,
      // @ts-ignore this is a type definition error in Twilio; dependencies should be object[] not a string
      dependencies: build.dependencies as string,
    };

    await this.createBuildAndDeploy(serviceSid, pluginName, request);
  }

  /**
   * Creates a {@link BuildInstance} and deploys/activates it
   * @param serviceSid  the serviceSid the {@link BuildInstance} belongs to
   * @param pluginName the plugin name that the build belongs to
   * @param request   the {@link BuildListInstanceCreateOptions} option
   */
  async createBuildAndDeploy(
    serviceSid: string,
    pluginName: string,
    request: BuildListInstanceCreateOptions,
  ): Promise<void> {
    const { environment } = await this.getBuildAndEnvironment(serviceSid, pluginName);
    if (!environment) {
      return;
    }

    const newBuild = await this.createBuild(serviceSid, request);
    await environment.deployments().create({ buildSid: newBuild.sid });
  }

  /**
   * Returns the {@link BuildInstance} belonging to the plugin name
   * @param serviceSid  the service sid
   * @param pluginName  the plugin name
   */
  async getBuild(serviceSid: string, pluginName: string): Promise<BuildInstance | undefined> {
    const { build } = await this.getBuildAndEnvironment(serviceSid, pluginName);

    return build;
  }

  /**
   * Deletes the {@link EnvironmentInstance}
   * @param serviceSid   the service sid
   * @param environment  the environment sid
   */
  async deleteEnvironment(serviceSid: string, environmentSid: string): Promise<boolean> {
    const service = await this.getService(serviceSid);
    if (!service) {
      return false;
    }

    return service.environments().get(environmentSid).remove();
  }

  /**
   * Returns the {@link EnvironmentInstance}
   * @param serviceSid  the service sid
   * @param pluginName  the plugin name
   */
  async getEnvironment(serviceSid: string, pluginName: string): Promise<EnvironmentInstance | null> {
    const service = this.client.get(serviceSid);
    if (!(await service.fetch())) {
      return null;
    }

    const list = await service.environments.list();
    const environment = list.find((e) => e.uniqueName === pluginName);
    if (!environment || !environment.sid) {
      return null;
    }

    return environment;
  }

  /**
   * Fetches the {@link BuildInstance}
   * @param serviceSid  the service sid
   * @param pluginName  the plugin name
   */
  private async getBuildAndEnvironment(serviceSid: string, pluginName: string): Promise<BuildEnvironment> {
    const service = await this.client.get(serviceSid).fetch();
    if (!service) {
      return {};
    }
    const list = await this.client.get(serviceSid).environments.list();
    const environment = list.find((e) => e.uniqueName === pluginName);
    if (!environment || !environment.buildSid) {
      return {};
    }

    const build = await this.client.get(serviceSid).builds.get(environment.buildSid).fetch();

    return {
      build,
      environment,
    };
  }

  /**
   * Creates a new {@link BuildInstance}
   * @param serviceSid  the service sid
   * @param data the {@link BuildListInstanceCreateOptions}
   */
  private async createBuild(serviceSid: string, data: BuildListInstanceCreateOptions): Promise<BuildInstance> {
    return new Promise(async (resolve, reject) => {
      const newBuild = await this.client.get(serviceSid).builds.create(data);
      this.logger.debug(`Created build ${newBuild.sid}`);

      const { sid } = newBuild;

      const timeoutId = setTimeout(() => {
        // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
        clearInterval(intervalId);
        reject(
          new TwilioApiError(
            11205,
            'Timeout while waiting for new Twilio Runtime build status to change to complete.',
            408,
          ),
        );
      }, ServerlessClient.timeoutMsec);

      const intervalId = setInterval(async () => {
        const build = await this.client.get(serviceSid).builds.get(sid).fetch();
        this.logger.debug(`Waiting for build status '${build.status}' to change to 'completed'`);

        if (build.status === 'failed') {
          clearInterval(intervalId);
          clearTimeout(timeoutId);

          reject(new TwilioApiError(20400, 'Twilio Runtime build has failed.', 400));
        }

        if (build.status === 'completed') {
          clearInterval(intervalId);
          clearTimeout(timeoutId);

          resolve(build);
        }
      }, ServerlessClient.pollingIntervalMsec);
    });
  }

  /**
   * Internal method to determine if the build has a legacy bundle
   * @param build   the {@link BuildInstance}
   * @param pluginName the plugin name
   * @private
   */
  private getLegacyAsset(build: BuildInstance, pluginName: string) {
    return build.assetVersions
      .map((asset) => asset as FileVersion)
      .find((asset) => asset.path === `/plugins/${pluginName}/0.0.0/bundle.js`);
  }
}
