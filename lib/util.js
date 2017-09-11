'use strict';

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

module.exports = {
	makeArray, requireJson
};
