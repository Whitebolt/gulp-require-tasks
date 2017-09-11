'use strict';

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
	} catch(err) {
	}
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
}

module.exports = {
	makeArray, requireJson, isObject, merge, unique
};
