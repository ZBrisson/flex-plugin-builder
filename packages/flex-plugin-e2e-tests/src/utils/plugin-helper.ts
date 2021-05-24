import axios from 'axios';
import { ConfiguredPluginResource } from 'flex-plugins-api-client';
import { logger } from 'flex-plugins-utils-logger';

import { Browser } from './browser';

/**
 * Waits for plugin to start at the given url
 * @param url plugin url to poll for a successful response
 * @param timeout maximum amount of time to wait until failing
 * @param pollInterval time to wait between each polling attempt
 */
const waitForPluginToStart = async (url: string, timeout: number, pollInterval: number): Promise<void> => {
  let counter = 0;

  while (true) {
    try {
      await axios.get(url);
      break;
    } catch (e) {
      if (counter === timeout) {
        logger.error(e);
        throw new Error('Plugin did not start');
      }
    }

    // eslint-disable-next-line no-loop-func
    await new Promise((r) => setTimeout(r, pollInterval));
    counter += pollInterval;
  }
};

/**
 * Waits for /plugins to contain the released plugin
 * @param flexBaseUrl Flex base URL
 * @param releasedPlugin plugin which was released
 * @param timeout maximum amount of time to wait until failing
 * @param pollInterval time to wait between each polling attempt
 */
const waitForPluginToRelease = async (
  flexBaseUrl: string,
  releasedPlugin: ConfiguredPluginResource,
  timeout: number,
  pollInterval: number,
): Promise<void> => {
  let counter = 0;

  while (true) {
    try {
      const plugins = await Browser.getPluginResponse(flexBaseUrl);

      const plugin = plugins.find((plugin) => plugin.name === releasedPlugin.unique_name);

      if (!plugin) {
        throw new Error(`/plugins did not contain ${releasedPlugin.unique_name}`);
      }

      break;
    } catch (e) {
      if (counter >= timeout) {
        throw e;
      }
    }

    // eslint-disable-next-line no-loop-func
    await new Promise((r) => setTimeout(r, pollInterval));
    counter += pollInterval;
  }
};

export default {
  waitForPluginToStart,
  waitForPluginToRelease,
};
