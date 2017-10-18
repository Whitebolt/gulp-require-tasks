
const xPreFunctionParams = /\)[\s\S]*/;
const xPostFunctionParams = /^.*?\(/;
const getParameters = replaceSequence([[xPreFunctionParams],[xPostFunctionParams]]);

module.exports = gulpRequireTasks;


const path = require('path');
const requireDirectory = require('require-directory');


const DEFAULT_OPTIONS = {
  path: process.cwd() + '/gulp-tasks',
  separator: ':',
  passGulp: true,
  passCallback: true,
  gulp: null
};

/**
 * Parse the source of a function returning an array of parameter names.
 *
 * @public
 * @param {Function|String} func       Function or function source to parse.
 * @returns {Array.<string>}           Array of parameter names.
 */
function parseParameters(func) {
  return getParameters(func).split(',').map(param=>param.trim());
}

/**
 * Perform a series of replacements on a string in sequence.
 *
 * @public
 * @param {string|*} [txt]      Text to do replacements on.  If it is not a string try to convert to string
 *                              via toString() method.
 * @param {Array} sequence      Replacement sequence as an array in format
 *                              [[<search-for>,<replacement>], [<search-for>,<replacement>]]. If replacement is not
 *                              present then replace with a blank string. If txt is not supplied then return a
 *                              replacer function that will accept text perform the given replacements.
 * @returns {string}            Replacement text.
 */
function replaceSequence(txt, sequence) {
  let _sequence = (sequence?sequence:txt);

  let _replaceSequence = txt=>{
    let _txt = (isString(txt) ? txt : txt.toString());
    _sequence.forEach(operation=>{
      _txt = _txt.replace(operation[0], operation[1] || '');
    });
    return _txt;
  };

  return (sequence?_replaceSequence(txt):_replaceSequence)
}

/**
 * Test if given value is a string.
 *
 * @param {*} value			Value to test.
 * @returns {boolean}		Is value a string?
 */
function isString(value) {
  return ((typeof value === 'string') || (value instanceof String));
}

function camelCaseToHythen(value) {
  return value.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase();
}

function getModule(paramName, mapper) {
  try {
    if (mapper.hasOwnProperty(paramName)) return (
        isString(mapper[paramName]) ?
            require(mapper[paramName]) :
            mapper[paramName]

    );
    return require('gulp-' + camelCaseToHythen(paramName));
  } catch(err) {
    try {
      return require(camelCaseToHythen(paramName));
    } catch(err) {

    }
  }
}



function gulpRequireTasks (options) {

  options = Object.assign({}, DEFAULT_OPTIONS, options);

  const gulp = options.gulp || require('gulp');

  // Recursively visiting all modules in the specified directory
  // and registering Gulp tasks.
  requireDirectory(module, options.path, {
    visit: moduleVisitor
  });


  /**
   * Registers the specified module. Task name is deducted from the specified path.
   *
   * @param {object|function} module
   * @param {string} modulePath
   */
  function moduleVisitor (module, modulePath) {

    module = normalizeModule(module);

    const taskName = taskNameFromPath(modulePath);

    if (module.dep) {
      console.warn(
        'Usage of "module.dep" property is deprecated and will be removed in next major version. ' +
        'Use "deps" instead.'
      );
    }

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

      const dynamicInclusion = !!(module.dynamicInclusion || options.dynamicInclusion);

      let mapper = Object.assign({
        done: callback,
        gulp: gulp
      }, options.mapper || {});

      if (options.arguments) {
        mapper.argguments = arguments;
      }

      let args = (
          dynamicInclusion ?
              parseParameters(module.fn).map(paramName=>getModule(paramName, mapper)) :
              []
      );

      // @deprecated
      // @todo: remove this in 2.0.0
      if (options.arguments) {
        console.warn(
          'Usage of "arguments" option is deprecated and will be removed in next major version. ' +
          'Use globals or module imports instead.'
        );
        args = Array.from(options.arguments);
      }

      if (options.passGulp && !dynamicInclusion) {
        args.unshift(gulp);
      }

      if (options.passCallback && !dynamicInclusion) {
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
