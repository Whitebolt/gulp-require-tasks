'use strict';

const {spawn} = require('child_process');
const fs = require('fs');

const charsSequence = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'.split('');

function randomString(length=32) {
	if (! length) length = Math.floor(Math.random() * charsSequence.length);
	let str = '';
	for (let i = 0; i < length; i++) str += charsSequence[Math.floor(Math.random() * charsSequence.length)];
	return str;
}

function makeArray(ary) {
	return (Array.isArray(ary)?ary:[ary]);
}

function isObject(obj) {
	return ((obj !== null) && (typeof obj === 'object'));
}

function requireJson(filePath, property) {
	try {
		if (filePath.trim() !== '') {
			let data = require(filePath);
			return (property ? data[property] || {} : data);
		}
	} catch(err) { }

	return {};
}

function unique(...ary) {
	return [...new Set([].concat(...ary))]
}

function merge(to, ...from) {
	from.forEach(from=>{
		Object.keys(from).forEach(property=>{
			if (Array.isArray(from[property])) {
				if (!Array.isArray(to[property])) {
					to[property] = (
						(!isObject(to[property]) && (to[property] !== undefined)) ?
							makeArray(to[property]) :
							[]
					);
				}
				to[property] = unique(to[property], from[property]);
			} else if (isObject(from[property])) {
				if (!isObject(to[property])) to[property] = {};
				merge(to[property], from[property]);
			} else {
				to[property] = from[property];
			}
		});
	});

	return to;
}

function nodeInstall(requires, yarn=false) {
	let deps = Object.keys(requires).map(moduleId=>moduleId + '@' + requires[moduleId]);
	let args = [];
	let cliArgs = [yarn?'add':'install', ...args, ...deps];

	return new Promise(resolve=>{
		spawn(yarn?'yarn':'npm', cliArgs, {stdio: 'inherit'})
			.on('close', ()=>resolve());
	});
}

function fileExists(path) {
	return fs.statSync(path).isFile();
}

module.exports = {
	makeArray, requireJson, isObject, merge, unique, randomString, nodeInstall, fileExists
};
