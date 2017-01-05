const _ = require('lodash'),
	vm = require('vm'),
	fs = require('fs'),
	util = require('util'),
	path = require('path'),
	logger = require('pomelo-logger').getLogger('pomelo-admin', __filename);

class Scripts
{
	constructor(opts)
    {
		this.app = opts.app;
		this.root = opts.path;
		this.commands = {
			'list' : this.list,
			'get'  : this.get,
			'save' : this.save,
			'run'  : this.run
		};
	}

	monitorHandler(agent, msg, callback)
    {
		const context = {
			app     : this.app,
			require : require,
			os      : require('os'),
			fs      : require('fs'),
			process : process,
			util    : util
		};
		try
        {
			vm.runInNewContext(msg.script, context);

			const result = context.result;
			if (!result)
            {
				callback(null, 'script result should be assigned to result value to script module context');
			}
			else
            {
				callback(null, result);
			}
		}
		catch (e)
        {
			callback(null, e.toString());
		}
	}

	clientHandler(agent, msg, callback)
    {
		const fun = this.commands[msg.command];
		if (!_.isFunction(fun))
        {
			callback(`unknown command:${msg.command}`);
			return;
		}

		fun(this, agent, msg, callback);
	}

	list(scriptModule, agent, msg, callback)
    {
        
		let scripts = [];
		const idMap = agent.idMap;
		const servers = _.keys(idMap);
      
		fs.readdir(scriptModule.root, (err, filenames) =>
        {
			if (err)
            {
				filenames = [];
			}
			scripts = _.concat(scripts, _.values(filenames));

			callback(null, {
				servers : servers,
				scripts : scripts
			});
		});
	}

	get(scriptModule, agent, msg, callback)
    {
		const filename = msg.filename;
		if (!filename)
        {
			callback('empty filename');
			return;
		}

		fs.readFile(path.join(scriptModule.root, filename), 'utf-8', (err, data) =>
        {
			if (err)
            {
				logger.error(`fail to read script file:${filename}, ${err.stack}`);
				callback(`fail to read script file:${filename}, ${err.stack}`);
			}

			callback(null, data);
		});
	}

	save(scriptModule, agent, msg, callback)
    {
		const filepath = path.join(scriptModule.root, msg.filename);

		fs.writeFile(filepath, msg.body, err =>
        {
			if (err)
            {
				logger.error(`fail to write script file:${msg.filename}, ${err.stack}`);
				callback(`fail to write script file:${msg.filename}, ${err.stack}`);
				return;
			}

			callback();
		});
	}

	run(scriptModule, agent, msg, callback)
    {
		agent.request(msg.serverId, module.exports.moduleId, msg, (err, data) =>
        {
			if (err)
            {
				logger.error(`fail to run script for ${err.stack}`);
				return;
			}
			callback(null, data);
		});
	}
}

module.exports = function(opts)
{
	return new Scripts(opts);
};

module.exports.moduleId = 'scripts';