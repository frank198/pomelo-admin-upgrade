const EventEmitter = require('events').EventEmitter,
	utils = require('./util/utils'),
	schedule = require('pomelo-scheduler'),
	protocol = require('./util/protocol'),
	MasterAgent = require('./masterAgent'),
	MonitorAgent = require('./monitorAgent'),
	logger = require('pomelo-logger').getLogger('pomelo-admin', __filename);

const MS_OF_SECOND = 1000;
class ConsoleService extends EventEmitter
{
	constructor(opts)
    {
		super();
		this.port = opts.port;
		this.env = opts.env;
		this.values = {};
		this.master = opts.master;

		this.modules = {};
		this.commands = {
			'list'    : ConsoleServiceUtility.ListCommand,
			'enable'  : ConsoleServiceUtility.EnableCommand,
			'disable' : ConsoleServiceUtility.DisableCommand
		};

		if (this.master)
        {
			this.authUser = opts.authUser || utils.defaultAuthUser;
			this.authServer = opts.authServer || utils.defaultAuthServerMaster;
			this.agent = new MasterAgent(this, opts);
		}
		else
        {
			this.type = opts.type;
			this.id = opts.id;
			this.host = opts.host;
			this.authServer = opts.authServer || utils.defaultAuthServerMonitor;
			this.agent = new MonitorAgent({
				consoleService : this,
				id             : this.id,
				type           : this.type,
				info           : opts.info
			});
		}
	}

	start(callback)
    {
		if (this.master)
        {
			this.agent.listen(this.port, err =>
            {
				if (err)
                {
					utils.invokeCallback(callback, err);
					return;
				}
				ConsoleServiceUtility.ExportEvent(this, this.agent, 'register');
				ConsoleServiceUtility.ExportEvent(this, this.agent, 'disconnect');
				ConsoleServiceUtility.ExportEvent(this, this.agent, 'reconnect');
				process.nextTick(() =>
				{
				    utils.invokeCallback(callback);
				});
			});
		}
		else
        {
			logger.info(`try to connect master: ${this.type}, ${this.host}, ${this.port}`);
		    this.agent.connect(this.port, this.host, callback);
		    ConsoleServiceUtility.ExportEvent(this, this.agent, 'close');
		}
		ConsoleServiceUtility.ExportEvent(this, this.agent, 'error');
		for (const mid in this.modules)
        {
		    this.enable(mid);
	    }
	}

	stop()
    {
		for (const mid in this.modules)
        {
		    this.disable(mid);
	    }
		this.agent.close();
	}

	register(moduleId, module)
    {
		this.modules[moduleId] = ConsoleServiceUtility.RegisterRecord(this, moduleId, module);
	}

	enable(moduleId)
    {
		const record = this.modules[moduleId];
		if (record && !record.enable)
        {
			record.enable = true;
			ConsoleServiceUtility.AddToSchedule(this, record);
			return true;
		}
		return false;
	}

	disable(moduleId)
    {
		const record = this.modules[moduleId];
		if (record && record.enable)
        {
			record.enable = false;
			if (record.schedule && record.jobId)
            {
				schedule.cancelJob(record.jobId);
				schedule.jobId = null;
			}
			return true;
		}
	    return false;
	}

	execute(moduleId, method, msg, callback)
    {
		const moduleData = this.modules[moduleId];
		if (!moduleData)
		{
			logger.error('unknown module: %j.', moduleId);
			callback(`unknown moduleId:${moduleId}`);
			return;
		}

		if (!moduleData.enable)
		{
			logger.error('module %j is disable.', moduleId);
			callback(`module ${moduleId} is disable`);
			return;
		}

		const module = moduleData.module;
		if (!module || typeof module[method] !== 'function')
		{
			logger.error('module %j dose not have a method called %j.', moduleId, method);
			callback(`module ${moduleId} dose not have a method called ${method}`);
			return;
		}

		const log = {
			action   : 'execute',
			moduleId : moduleId,
			method   : method,
			msg      : msg
		};

		const aclMsg = ConsoleServiceUtility.AclControl(this.agent, 'execute', method, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1)
        {
			log['error'] = aclMsg;
			this.emit('admin-log', log, aclMsg);
			callback(new Error(aclMsg), null);
			return;
		}

		if (method === 'clientHandler')
        {
			this.emit('admin-log', log);
		}

		module[method](this.agent, msg, callback);
	}

	command(command, moduleId, msg, callback)
    {
		const fun = this.commands[command];
		if (!fun || typeof fun !== 'function')
        {
			callback(`unknown command:${command}`);
			return;
		}

		const log = {
			action   : 'command',
			moduleId : moduleId,
			msg      : msg
		};

		const aclMsg = ConsoleServiceUtility.AclControl(this.agent, 'command', null, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1)
        {
			log['error'] = aclMsg;
			this.emit('admin-log', log, aclMsg);
			callback(new Error(aclMsg), null);
			return;
		}

		this.emit('admin-log', log);
		fun(this, moduleId, msg, callback);
	}

	set(moduleId, value)
    {
		this.values[moduleId] = value;
	}

	get(moduleId)
    {
		return this.values[moduleId];
	}
}

class ConsoleServiceUtility
{
	static ExportEvent(consoleService, agent, eventName)
    {
		agent.on(eventName, (...args) =>
        {
			args.unshift(eventName);
			consoleService.emit(...args);
		});
	}

	static RegisterRecord(consoleService, moduleId, module)
    {
		const record = {
			moduleId : moduleId,
			module   : module,
			enable   : false
		};

		if (module.type && module.interval)
        {
			if (!consoleService.master && record.module.type === 'push' || consoleService.master && record.module.type !== 'push')
            {
                // push for monitor or pull for master(default)
				record.delay = module.delay || 0;
				record.interval = module.interval || 1;
                // normalize the arguments
				if (record.delay < 0)
                {
					record.delay = 0;
				}
				if (record.interval < 0)
                {
					record.interval = 1;
				}
				record.interval = Math.ceil(record.interval);
				record.delay *= MS_OF_SECOND;
				record.interval *= MS_OF_SECOND;
				record.schedule = true;
			}
		}
		return record;
	}

	static AddToSchedule(consoleService, record)
    {
		if (record && record.schedule)
        {
			record.jobId = schedule.scheduleJob(
				{
					start  : Date.now() + record.delay,
					period : record.interval
				},
                ConsoleServiceUtility.DoScheduleJob,
				{
					service : consoleService,
					record  : record
				});
	    }
	}

	static AclControl(agent, action, method, moduleId, msg)
    {
		if (action === 'execute')
        {
			if (method !== 'clientHandler' || moduleId !== '__console__')
            {
				return 0;
			}

			const signal = msg.signal;
			if (!signal || !(signal === 'stop' || signal === 'add' || signal === 'kill'))
            {
				return 0;
			}
		}

		const clientId = msg.clientId;
		if (!clientId)
        {
			return 'Unknow clientId';
		}

		const _client = agent.getClientById(clientId);
		if (_client && _client.info && _client.info.level)
        {
			const level = _client.info.level;
			if (level > 1)
            {
				return 'Command permission denied';
			}
		}
		else
        {
			return 'Client info error';
		}
		return 1;
	}

	static DoScheduleJob(args)
    {
		const service = args.service;
		const record = args.record;
		if (!service || !record || !record.module || !record.enable)
        {
			return;
		}

		if (service.master)
        {
			record.module.masterHandler(service.agent, null, err =>
            {
				logger.error(`interval push should not have a callback.${err}`);
			});
		}
		else
        {
			record.module.monitorHandler(service.agent, null, err =>
            {
				logger.error(`interval push should not have a callback.${err}`);
			});
		}
	}

	static ListCommand(consoleService, moduleId, msg, callback)
    {
		const modules = consoleService.modules;
		const result = [];

		for (const moduleId in modules)
        {
			if (/^__\w+__$/.test(moduleId))
            {
				continue;
			}

			result.push(moduleId);
		}

		callback(null, {
			modules : result
		});
	}

	static EnableCommand(consoleService, moduleId, msg, callback)
    {
		if (!moduleId)
		{
			logger.error(`fail to enable admin module for ${moduleId}`);
			callback('empty moduleId');
			return;
		}

		const modules = consoleService.modules;
		if (!modules[moduleId])
        {
			callback(null, protocol.PRO_FAIL);
			return;
		}

		if (consoleService.master)
        {
			consoleService.enable(moduleId);
			consoleService.agent.notifyCommand('enable', moduleId, msg);
			callback(null, protocol.PRO_OK);
		}
		else
        {
			consoleService.enable(moduleId);
			callback(null, protocol.PRO_OK);
		}
	}

	static DisableCommand(consoleService, moduleId, msg, callback)
    {
		if (!moduleId)
        {
			logger.error(`fail to enable admin module for ${moduleId}`);
			callback('empty moduleId');
			return;
		}

		const modules = consoleService.modules;
		if (!modules[moduleId])
        {
			callback(null, protocol.PRO_FAIL);
			return;
		}

		if (consoleService.master)
        {
			consoleService.disable(moduleId);
			consoleService.agent.notifyCommand('disable', moduleId, msg);
			callback(null, protocol.PRO_OK);
		}
		else
        {
			consoleService.disable(moduleId);
			callback(null, protocol.PRO_OK);
		}
	}
}

module.exports.createMasterConsole = function(opts)
{
	opts = opts || {};
	opts.master = true;
	return new ConsoleService(opts);
};

module.exports.createMonitorConsole = function(opts)
{
	return new ConsoleService(opts);
};