const fs = require('fs');
const defineGetter = require('./lib/util/utils').DefineGetter;
const consoleService = require('./lib/consoleService');

module.exports.createMasterConsole = consoleService.createMasterConsole;
module.exports.createMonitorConsole = consoleService.createMonitorConsole;
module.exports.adminClient = require('./lib/client/client');

exports.modules = {};
const dirName = __dirname;
fs.readdirSync(`${dirName}/lib/modules`).forEach(function(filename)
{
	if (/\.js$/.test(filename))
	{
		const name = filename.substr(0, filename.lastIndexOf('.'));
		const _module = require(`./lib/modules/${name}`);
		if (!_module.moduleError)
		{
			defineGetter(exports.modules, name, () =>
			{
				return _module;
			});
		}
	}
});