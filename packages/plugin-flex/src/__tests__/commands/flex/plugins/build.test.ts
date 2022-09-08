import createTest from '../../../framework';
import FlexPluginsBuild from '../../../../commands/flex/plugins/build';

describe('Build2', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const createCommand = async (...args: string[]): Promise<FlexPluginsBuild> => {
    const cmd = await createTest(FlexPluginsBuild)(...args);
    await cmd.init();
    return cmd;
  };

  it('should have flag as own property', () => {
    expect(FlexPluginsBuild.hasOwnProperty('flags')).toEqual(true);
  });

  it('should run build script', async () => {
    const cmd = await createCommand();

    jest.spyOn(cmd, 'builderVersion', 'get').mockReturnValue(4);
    jest.spyOn(cmd, 'runScript').mockReturnThis();

    await cmd.doRun();

    expect(cmd.runScript).toHaveBeenCalledTimes(2);
    expect(cmd.runScript).toHaveBeenCalledWith('pre-script-check');
    expect(cmd.runScript).toHaveBeenCalledWith('build');
  });

  it('should have compatibility set', async () => {
    const cmd = await createTest(FlexPluginsBuild)();

    expect(cmd.checkCompatibility).toEqual(true);
  });
});
