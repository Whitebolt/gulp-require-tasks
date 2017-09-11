
module.exports = gulpRequireTasks;


const path = require('path');
const requireDirectory = require('require-directory');
const git = require('simple-git')(process.cwd());
const {makeArray, requireJson, merge, randomString, nodeInstall, fileExists} = require('./lib/util');
const commandExists = require('command-exists').sync;

const parentPackagePath = process.cwd() + '/package.json';
const yarn = fileExists(process.cwd() + '/yarn.lock') && commandExists('yarn');

const DEFAULT_OPTIONS = {
	path: process.cwd() + '/gulp-tasks',
	separator: ':',
	passGulp: true,
	passCallback: true,
	gulp: null,
	loadSettings: false,
	packageSettingsId: 'gulp',
	localSettings: '/local.json',
	settingsParser: settings=>settings,
	yarn
};

function getTaskIdFromArgs(args) {
	return args.find(arg=>/^[^/\-]/.test(arg));
}


function gulpRequireTasks (options) {

	options = Object.assign({}, DEFAULT_OPTIONS, options);

	const gulp = options.gulp || require('gulp');
	const taskId  = (getTaskIdFromArgs(process.argv) || '').trim();
	const gistsToImport = requireJson(parentPackagePath, 'gulp-tasks');

	// Recursively visiting all modules in the specified directory
	// and registering Gulp tasks.
	requireDirectory(module, options.path, {
		visit: (module, modulePath)=>moduleVisitor(module, modulePath)
	});



	if ((taskId !== '') && !gulp.tasks.hasOwnProperty(taskId) && gistsToImport.hasOwnProperty(taskId)) {
		loadMissingTask(taskId);
	}

	function installRequires(module) {
		return ((module.requires && Object.keys(module.requires).length) ?
			nodeInstall(module.requires, options.yarn).then(()=>module) :
			Promise.resolve(module)
		);
	}

	function gistClone(taskId, gistId) {
		return new Promise((resolve, reject)=>{
			git.clone(
				'https://gist.github.com/' + gistId + '.git',
				options.path + '/' + taskId + '/',
				{},
				err=>{
					if (err) return reject(err);
					resolve();
				}
			);
		});
	}

	function importDep(dep) {
		return (
			((dep !== '') && !gulp.tasks.hasOwnProperty(dep) && gistsToImport.hasOwnProperty(dep)) ?
				importGist(gistsToImport[dep], dep) :
				Promise.resolve()
		);
	}

	function importGist(gistId, taskId, overrideTaskName) {
		return gistClone(taskId, gistId).then(()=>{
			let modulePath = options.path + '/' + taskId + '/' + taskId + '.js';
			let module = require(modulePath);
			moduleVisitor(module, modulePath, overrideTaskName);
			return installRequires(module);
		}).then(module=>{
			if (module.deps && module.deps.length) return Promise.all(module.deps.map(importDep));
		});
	}

	function loadMissingTask(taskId) {
		gulp.task(taskId, [], done=>{
			const overrideTaskName = randomString();
			importGist(gistsToImport[taskId], taskId, overrideTaskName)
				.then(()=>gulp.start(overrideTaskName))
				.then(()=>done());
		});
	}

	function getSettings() {
		options.packageSettingsId = ((options.packageSettingsId.toString().trim() === '') ? null : options.packageSettingsId);
		let dataArray = [requireJson(parentPackagePath, options.packageSettingsId)].concat(
			makeArray(options.localSettings).map(filePath=>requireJson(process.cwd() + filePath))
		);
		return options.settingsParser(merge({}, ...dataArray), dataArray, requireJson(parentPackagePath));
	}

	/**
	 * Registers the specified module. Task name is deducted from the specified path.
	 *
	 * @param {object|function} module
	 * @param {string} modulePath
	 */
	function moduleVisitor (module, modulePath, overrideTaskName) {
		module = normalizeModule(module);

		const taskName = overrideTaskName || taskNameFromPath(modulePath);

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

			if (options.loadSettings) args.push(getSettings());
			if (options.passGulp) args.unshift(gulp);
			if (options.passCallback) args.push(callback);

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

			if ((taskNameParts.length > 1) && (taskNameParts[taskNameParts.length - 1] === taskNameParts[taskNameParts.length - 2])) {
				taskNameParts.pop();
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
			deps: [],
			requires: {}
		};
	} else {
		return module;
	}
}
