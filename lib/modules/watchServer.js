const CreateCountDownLatch = require('../util/countDownLatch'),
	utils = require('../util/utils'),
	monitor = require('pomelo-monitor'),
	util = require('util'),
	fs = require('fs'),
	vm = require('vm'),
	_ = require('lodash');

class WatchServer
{
	constructor(opts)
    {
		opts = opts || {};
	    this.app = opts.app;
	}

	monitorHandler(agent, msg, callback)
    {
		const comd = msg['comd'];
		const context = msg['context'];
		const param = msg['param'];
		const app = this.app;

		const handle = 'monitor';

		switch (comd)
        {
		case 'servers':
			WatchServerUtility.ShowServers(handle, agent, comd, context, callback);
			break;
		case 'connections':
			WatchServerUtility.ShowConnections(handle, agent, app, comd, context, callback);
			break;
		case 'logins':
			WatchServerUtility.ShowLogins(handle, agent, app, comd, context, callback);
			break;
		case 'modules':
			WatchServerUtility.ShowModules(handle, agent, comd, context, callback);
			break;
		case 'status':
			WatchServerUtility.ShowStatus(handle, agent, comd, context, callback);
			break;
		case 'config':
			WatchServerUtility.ShowConfig(handle, agent, app, comd, context, param, callback);
			break;
		case 'proxy':
			WatchServerUtility.ShowProxy(handle, agent, app, comd, context, param, callback);
			break;
		case 'handler':
			WatchServerUtility.ShowHandler(handle, agent, app, comd, context, param, callback);
			break;
		case 'components':
			WatchServerUtility.ShowComponents(handle, agent, app, comd, context, param, callback);
			break;
		case 'settings':
			WatchServerUtility.ShowSettings(handle, agent, app, comd, context, param, callback);
			break;
		case 'cpu':
			WatchServerUtility.DumpCPU(handle, agent, comd, context, param, callback);
			break;
		case 'memory':
			WatchServerUtility.DumpMemory(handle, agent, comd, context, param, callback);
			break;
		case 'get':
			WatchServerUtility.GetApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'set':
			WatchServerUtility.SetApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'enable':
			WatchServerUtility.EnableApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'disable':
			WatchServerUtility.DisableApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'run':
			WatchServerUtility.RunScript(handle, agent, app, comd, context, param, callback);
			break;
		default:
			WatchServerUtility.ShowError(handle, agent, comd, context, callback);
		}
	}

	clientHandler(agent, msg, callback)
    {
		const comd = msg['comd'];
		const context = msg['context'];
		const param = msg['param'];
		const app = this.app; // master app

		if (!comd || !context)
		{
			callback('lack of comd or context param');
			return;
		}

		const handle = 'client';
		switch (comd)
		{
		case 'servers':
			WatchServerUtility.ShowServers(handle, agent, comd, context, callback);
			break;
		case 'connections':
			WatchServerUtility.ShowConnections(handle, agent, app, comd, context, callback);
			break;
		case 'logins':
			WatchServerUtility.ShowLogins(handle, agent, app, comd, context, callback);
			break;
		case 'modules':
			WatchServerUtility.ShowModules(handle, agent, comd, context, callback);
			break;
		case 'status':
			WatchServerUtility.ShowStatus(handle, agent, comd, context, callback);
			break;
		case 'config':
			WatchServerUtility.ShowConfig(handle, agent, app, comd, context, param, callback);
			break;
		case 'proxy':
			WatchServerUtility.ShowProxy(handle, agent, app, comd, context, param, callback);
			break;
		case 'handler':
			WatchServerUtility.ShowHandler(handle, agent, app, comd, context, param, callback);
			break;
		case 'components':
			WatchServerUtility.ShowComponents(handle, agent, app, comd, context, param, callback);
			break;
		case 'settings':
			WatchServerUtility.ShowSettings(handle, agent, app, comd, context, param, callback);
			break;
		case 'cpu':
			WatchServerUtility.DumpCPU(handle, agent, comd, context, param, callback);
			break;
		case 'memory':
			WatchServerUtility.DumpMemory(handle, agent, comd, context, param, callback);
			break;
		case 'get':
			WatchServerUtility.GetApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'set':
			WatchServerUtility.SetApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'enable':
			WatchServerUtility.EnableApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'disable':
			WatchServerUtility.DisableApp(handle, agent, app, comd, context, param, callback);
			break;
		case 'run':
			WatchServerUtility.RunScript(handle, agent, app, comd, context, param, callback);
			break;
		default:
			WatchServerUtility.ShowError(handle, agent, comd, context, callback);
		}
	}
}

class WatchServerUtility
{
	static ShowServers(handle, agent, comd, context, callback)
    {
		if (handle === 'client')
        {
			const serverInfo = {};
			const idMap = agent.idMap;
			const count = utils.size(idMap);
			const latch = CreateCountDownLatch(count, function()
			{
				callback(null, {
					msg : serverInfo
				});
			});

			_.forEach(agent.idMap, (record, sid) =>
            {
				agent.request(
                     record.id,
                     module.exports.moduleId,
					{
						comd    : comd,
						context : context
					},
                    function(msg)
                    {
	serverInfo[msg.serverId] = msg.body;
	latch.done();
});
			});
		}
		else if (handle === 'monitor')
        {
			const serverId = agent.id;
			const serverType = agent.type;
			const info = agent.info;
			const pid = process.pid;
			const heapUsed = (process.memoryUsage().heapUsed / (1000 * 1000)).toFixed(2);
			const uptime = (process.uptime() / 60).toFixed(2);
			callback({
				serverId : serverId,
				body     : {
					serverId   : serverId,
					serverType : serverType,
					host       : info['host'],
					port       : info['port'],
					pid        : pid,
					heapUsed   : heapUsed,
					uptime     : uptime
				}
			});
		}
	}

	static ShowConnections(handle, agent, app, comd, context, callback)
    {
		if (handle === 'client')
        {
			const idMap = agent.idMap;
			if (context === 'all')
            {
				const serverInfo = {};
				let count = 0;
				for (const key in idMap)
{
					if (idMap[key].info.frontend === 'true')
{
						count++;
					}
				}
				const latch = CreateCountDownLatch(count, function()
{
					callback(null, {
						msg : serverInfo
					});
				});
				_.forEach(idMap, (record, sid) =>
                {
					if (record.info.frontend === 'true')
                    {
						agent.request(
                            record.id,
                            module.exports.moduleId,
							{
								comd    : comd,
								context : context
							},
                            function(msg)
                            {
	serverInfo[msg.serverId] = msg.body;
	latch.done();
});
					}
				});
			}
			else
            {
				const record = idMap[context];
				if (!record)
{
					callback(`the server ${context} not exist`);
				}
				if (record.info.frontend === 'true')
                {
					agent.request(
                            record.id,
                            module.exports.moduleId,
						{
							comd    : comd,
							context : context
						},
                            function(msg)
                            {
	const serverInfo = {};
	serverInfo[msg.serverId] = msg.body;
	callback(null, {
		msg : serverInfo
	});
});
				}
				else
                {
					callback('\nthis command should be applied to frontend server\n');
				}
			}
		}
		else if (handle === 'monitor')
        {
			const connection = app.components.__connection__;
			if (!connection)
{
				callback({
					serverId : agent.id,
					body     : 'error'
				});
				return;
			}

			callback({
				serverId : agent.id,
				body     : connection.getStatisticsInfo()
			});
		}
	}

	static ShowLogins(handle, agent, app, comd, context, callback)
    {
		WatchServerUtility.ShowConnections(handle, agent, app, comd, context, callback);
	}

	static ShowModules(handle, agent, comd, context, callback)
    {
		const modules = agent.consoleService.modules;
		const result = _.keys(modules);
		callback(null, {
			msg : result
		});
	}

	static ShowStatus(handle, agent, comd, context, callback)
    {
		if (handle === 'client')
        {
			agent.request(
                context,
                module.exports.moduleId,
				{
					comd    : comd,
					context : context
				}, (erInfo, msg) =>
				{
					callback(null, {
						msg : msg
					});
				});
		}
		else if (handle === 'monitor')
        {
			const serverId = agent.id;
			const pid = process.pid;
			const params = {
				serverId : serverId,
				pid      : pid
			};
			monitor.psmonitor.getPsInfo(params, (erInfo, data) =>
            {
				callback(null, {
					serverId : agent.id,
					body     : data
				});
			});
		}
	}

	static ShowConfig(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			if (param === 'master')
            {
				callback(null, {
					masterConfig : app.get('masterConfig') || 'no config to master in app.js',
					masterInfo   : app.get('master')
				});
				return;
			}

			agent.request(
                context,
                module.exports.moduleId,
				{
					comd    : comd,
					param   : param,
					context : context
				}, (erInfo, msg) =>
                {
					callback(null, msg);
				});
		}
		else if (handle === 'monitor')
        {
			const key = `${param}Config`;
			callback(null, WatchServerUtility.Clone(param, app.get(key)));
		}
	}

	static ShowProxy(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			WatchServerUtility.ProxyCallBack(app, context, callback);
		}
	}

	static ShowHandler(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			WatchServerUtility.HandlerCallBack(app, context, callback);
		}
	}

	static ShowComponents(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			const _components = app.components;
			const res = {};
			_.forEach(_components, (component, key) =>
            {
				res[component] = WatchServerUtility.Clone(component, app.get(`${WatchServerUtility.GetComponentName(component)}Config`));
			});
			callback(null, res);
		}
	}

	static ShowSettings(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			const _components = app.components;
			const res = {};
			_.forEach(_components, (component, key) =>
            {
				res[component] = WatchServerUtility.Clone(component, app.get(`${component}Config`));
			});
			callback(null, res);
		}
	}

	static DumpCPU(handle, agent, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
            // var times = param['times'];
            // var filepath = param['filepath'];
            // var force = param['force'];
            /**
            if (!/\.cpuprofile$/.test(filepath)) {
                filepath = filepath + '.cpuprofile';
            }
            if (!times || !/^[0-9]*[1-9][0-9]*$/.test(times)) {
                callback('no times or times invalid error');
                return;
            }
            checkFilePath(filepath, force, function(err) {
                if (err) {
                    callback(err);
                    return;
                }
                //ndump.cpu(filepath, times);
                callback(null, filepath + ' cpu dump ok');
            });
            */
			callback(null, 'cpu dump is unused in 1.0 of pomelo');
		}
	}

	static DumpMemory(handle, agent, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			let filepath = param['filepath'];
			const force = param['force'];
			if (!/\.heapsnapshot$/.test(filepath))
            {
				filepath = `${filepath}.heapsnapshot`;
			}
			WatchServerUtility.CheckFilePath(filepath, force, function(err)
            {
				if (err)
                {
					callback(err);
					return;
				}
				const heapdump = require('heapdump');
				heapdump.writeSnapshot(filepath);
				callback(null, `${filepath} memory dump ok`);
			});
		}
	}

	static GetApp(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			let res = app.get(param);
			if (!WatchServerUtility.CheckJSON(res))
			{
				res = 'object';
			}
			callback(null, res || null);
		}
	}

	static SetApp(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			const key = param['key'];
			const value = param['value'];
			app.set(key, value);
			callback(null, `set ${key}:${value} ok`);
		}
	}

	static EnableApp(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			app.enable(param);
		    callback(null, `enable ${param} ok`);
		}
	}

	static DisableApp(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			app.disable(param);
		    callback(null, `disable ${param} ok`);
		}
	}

	static RunScript(handle, agent, app, comd, context, param, callback)
    {
		if (handle === 'client')
        {
			WatchServerUtility.ShowRequestForClient(handle, agent, comd, context, param, callback);
		}
		else if (handle === 'monitor')
        {
			const ctx = {
				app    : app,
				result : null
			};
			try
            {
				vm.runInNewContext(`result = ${param}`, ctx, 'myApp.vm');
				callback(null, util.inspect(ctx.result));
			}
			catch (e)
            {
				callback(null, e.stack);
			}
		}
	}

	static ShowError(handle, agent, comd, context, callback)
    {
		// no function
	}

	static Clone(param, obj)
    {
		const result = {};
		let flag = 1;
		_.forEach(obj, (objValue, key) =>
        {
			if (!_.isFunction(objValue) && !_.isObject(objValue))
            {
				flag = 0;
				result[key] = objValue;
			}
		});
		if (flag)
        {
            // return 'no ' + param + 'Config info';
		}
		return result;
	}

	static CheckFilePath(filepath, force, callback)
    {
		if (!force && fs.existsSync(filepath))
        {
			callback('filepath file exist');
			return;
		}
		fs.writeFile(filepath, 'test', function(err)
        {
			if (err)
            {
				callback('filepath invalid error');
				return;
			}
			fs.unlinkSync(filepath);
			callback(null);
		});
	}

	static ProxyCallBack(app, context, callback)
    {
		const msg = {};
		const proxy = app.components.__proxy__;
		if (proxy && proxy.client && proxy.client.proxies.user)
        {
			const proxies = proxy.client.proxies.user;
			const server = app.getServerById(context);
			if (!server)
            {
				callback(`no server with this id ${context}`);
			}
			else
            {
				const type = server['serverType'];
				const tmp = proxies[type];
				msg[type] = {};
				_.forEach(tmp, (tmpValue, proxy) =>
                {
					msg[type][proxy] = {};
					_.forEach(tmpValue, (rpcValue, rpc) =>
                    {
						if (_.isFunction(rpcValue))
                        {
							msg[type][proxy][rpc] = 'function';
						}
					});
				});
				callback(null, msg);
			}
		}
		else
        {
			callback('no proxy loaded');
		}
	}

	static HandlerCallBack(app, context, callback)
    {
		const msg = {};
		let server = app.components.__server__;
		if (server && server.server && server.server.handlerService.handlers)
        {
			const handles = server.server.handlerService.handlers;
			server = app.getServerById(context);
			if (!server)
            {
				callback(`no server with this id ${context}`);
			}
			else
            {
				const type = server['serverType'];
				const tmp = handles;
				msg[type] = {};
				_.forEach(tmp, (tmpValue, proxy) =>
                {
					msg[type][proxy] = {};
					_.forEach(tmpValue, (rpcValue, rpc) =>
                    {
						if (_.isFunction(rpcValue))
                        {
							msg[type][proxy][rpc] = 'function';
						}
					});
				});
				callback(null, msg);
			}
		}
		else
        {
			callback('no handler loaded');
		}
	}

	static GetComponentName(c)
    {
		let t = c.match(/^__(\w+)__$/);
		if (t)
        {
			t = t[1];
		}
		return t;
	}

	static CheckJSON(obj)
    {
		if (!obj)
		{
			return true;
		}
		try
        {
			JSON.stringify(obj);
		}
		catch (e)
        {
			return false;
		}
		return true;
	}

	static ShowRequestForClient(handle, agent, comd, context, param, callback)
    {
		if (context === 'all')
        {
			callback('context error');
			return;
		}

		agent.request(
            context,
            module.exports.moduleId,
			{
				comd    : comd,
				param   : param,
				context : context
			}, (erInfo, msg) =>
		    {
				callback(null, msg);
			});
	}
}

module.exports = function(opts)
{
	return new WatchServer(opts);
};

module.exports.moduleId = 'watchServer';