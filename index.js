const fs = require('fs');
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
			exports.modules.__defineGetter__(name, function()
			{
				return _module;
			});
		}
	}
});