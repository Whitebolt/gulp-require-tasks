
module.exports = gulpRequireTasks;


const path = require('path');
const requireDirectory = require('require-directory');
const merge = require('lodash.merge');
const gist = require('gist-get');
const fs = require('fs');

const charsSequence = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'.split('');

const DEFAULT_OPTIONS = {
  path: process.cwd() + '/gulp-tasks',
  separator: ':',
  passGulp: true,
  passCallback: true,
  gulp: null,
  loadSettings: false,
  packageSettingsId: 'gulp',
  localSettings: '/local.json',
  settingsParser: settings=>settings
};

function randomString(length=32) {
  if (! length) length = Math.floor(Math.random() * charsSequence.length);
  let str = '';
  for (let i = 0; i < length; i++) str += charsSequence[Math.floor(Math.random() * charsSequence.length)];
  return str;
}

function getGist(taskName, gistId) {
  return new Promise((resolve, reject)=> {
    gist.get(gistId, (err, results)=> {
      if (err) return reject(err);
      let result = {};
      result[taskName] = results.files[Object.keys(results.files)[0]].content;
      return resolve(result);
    });
  });
}

function writeFile(fileName, content) {
  return new Promise((resolve, reject)=>{
    fs.writeFile(fileName, content, err=>{
      if(err) return reject(err);
      return resolve();
    });
  });
}


function gulpRequireTasks (options) {
  const taskList = new Set();
  const gists = requireJson(process.cwd() + '/package.json', 'gulp-tasks');

  options = Object.assign({}, DEFAULT_OPTIONS, options);

  const gulp = options.gulp || require('gulp');

  if (options.loadSettings) options.settings = getSettings();

  // Recursively visiting all modules in the specified directory
  // and registering Gulp tasks.
  requireDirectory(module, options.path, {
    visit: moduleVisitor
  });

  gulp.task('gist-get', done=>{
    Promise.all(
        Object.keys(gists).map(taskName=>getGist(taskName, gists[taskName]))
    ).then(
        results=>Object.assign({}, ...results)
    ).then(
        tasks=>Object.keys(tasks).map(taskId=>writeFile(options.path + '/' + taskId + '.js', tasks[taskId]))
    ).then(()=>done());
  });

  const taskName = process.argv[process.argv.length-1];
  if (!taskList.has(taskName) && gists.hasOwnProperty(taskName)) {
    const taskPath = options.path + '/' + taskName + '.js';
    const taskId = randomString();

    gulp.task(taskName, [], done=>{
      getGist(taskName, gists[taskName]).then(
          result=>writeFile(taskPath, result[taskName])
      ).then(()=>{
        moduleVisitor(require(taskPath), taskPath, taskId);
        return Promise.resolve(gulp.tasks[taskId].fn());
      }).then(()=>{
        done();
      })
    });
  }

  function makeArray(ary) {
    return (Array.isArray(ary)?ary:[ary]);
  }

  function requireJson(filePath, property) {
    try {
      if (filePath.trim() !== '') {
        let data = require(filePath);
        return (property ? data[property] || {} : data);
      }
    } catch(err) {
    }
    return {};
  }

  function getSettings() {
    options.packageSettingsId = (((options.packageSettingsId || '').toString().trim() === '') ? null : options.packageSettingsId);

    let dataArray = [requireJson(process.cwd() + '/package.json', options.packageSettingsId)].concat(
        makeArray(options.localSettings).map(filePath=>requireJson(process.cwd() + filePath))
    );
    return options.settingsParser(merge({}, ...dataArray), dataArray, requireJson(process.cwd() + '/package.json'));
  }


  /**
   * Registers the specified module. Task name is deducted from the specified path.
   *
   * @param {object|function} module
   * @param {string} modulePath
   */
  function moduleVisitor (module, modulePath, taskName=taskNameFromPath(modulePath)) {

    module = normalizeModule(module);

    if (module.dep) {
      console.warn(
        'Usage of "module.dep" property is deprecated and will be removed in next major version. ' +
        'Use "deps" instead.'
      );
    }

    taskList.add(taskName);

    gulp.task(
      taskName,
      // @todo: deprecate `module.dep` in 2.0.0
      module.deps || module.dep || [],
      module.nativeTask || taskFunction
    );


    /**
     * Wrapper around user task function.
     * It passes special arguments to the user function according
     * to the configuration.
     *
     * @param {function} callback
     *
     * @returns {*}
     */
    function taskFunction (callback) {

      if ('function' !== typeof module.fn) {
        callback();
        return;
      }

      let args = [];

      // @deprecated
      // @todo: remove this in 2.0.0
      if (options.arguments) {
        console.warn(
            'Usage of "arguments" option is deprecated and will be removed in next major version. ' +
            'Use globals or module imports instead.'
        );
        args = Array.from(options.arguments);
      }

      if (options.loadSettings) {
        args.push(options.settings);
      }

      if (options.passGulp) {
        args.unshift(gulp);
      }

      if (options.passCallback) {
        args.push(callback);
      }

      return module.fn.apply(module, args);

    }

    /**
     * Deducts task name from the specified module path.
     *
     * @returns {string}
     */
    function taskNameFromPath (modulePath) {

      const relativePath = path.relative(options.path, modulePath);

      // Registering root index.js as a default task.
      if ('index.js' === relativePath) {
        return 'default';
      }

      const pathInfo = path.parse(relativePath);
      const taskNameParts = [];

      if (pathInfo.dir) {
        taskNameParts.push.apply(taskNameParts, pathInfo.dir.split(path.sep));
      }
      if ('index' !== pathInfo.name) {
        taskNameParts.push(pathInfo.name);
      }

      return taskNameParts.join(options.separator);

    }

  }

}

/**
 * Normalizes module definition.
 *
 * @param {function|object} module
 *
 * @returns {object}
 */
function normalizeModule (module) {
  if ('function' === typeof module) {
    return {
      fn: module,
      deps: []
    };
  } else {
    return module;
  }
}
