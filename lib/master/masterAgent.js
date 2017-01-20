const EventEmitter = require('events').EventEmitter,
	utils = require('../util/utils'),
	_ = require('lodash'),
	protocol = require('../util/protocol'),
	MqttServer = require('../protocol/mqtt/mqttServer'),
	MasterSocket = require('./masterSocket'),
	logger = require('pomelo-logger').getLogger('pomelo-admin', 'MasterAgent');

const ST_INITED = 1;
const ST_STARTED = 2;
const ST_CLOSED = 3;

/**
 * MasterAgent Constructor
 *
 * @class MasterAgent
 * @extends {EventEmitter}
 */
class MasterAgent extends EventEmitter
{
    /**
     * Creates an instance of MasterAgent.
     *
     * @param {ConsoleService} consoleService
     * @param {Object} opts construct parameter
     *                      opts.consoleService {Object} consoleService
     *                      opts.id {String} server id
     *                      opts.type {String} server type, 'master', 'connector', etc.
     *                      opts.socket {Object} socket-io object
     *                      opts.reqId {Number} reqId add by 1
     *                      opts.callbacks {Object} callbacks
     *                      opts.state {Number} MasterAgent state
     *
     * @memberOf MasterAgent
     */
	constructor(consoleService, opts)
    {
		super();
	    opts = opts || {};
	    this.reqId = 1;
	    this.idMap = {};
	    this.msgMap = {};
	    this.typeMap = {};
	    this.clients = {};
	    this.sockets = {};
	    this.slaveMap = {};
	    this.server = null;
	    this.callbacks = {};
	    this.state = ST_INITED;
	    this.whitelist = opts.whitelist || {};
	    this.consoleService = consoleService;
	}

    /**
     * master listen to a port and handle register and request
     *
     * @param {String} port
     * @param {Function} callback
     * @returns
     *
     * @memberOf MasterAgent
     */
	listen(port, callback)
    {
		if (this.state > ST_INITED)
        {
			logger.error('master agent has started or closed.');
			return;
		}
		this.state = ST_STARTED;
	    this.server = new MqttServer();
	    this.server.listen(port);
		this.server.on('error', err =>
        {
			this.emit('error', err);
			utils.invokeCallback(callback, err);
		});

	    this.server.once('listening', () =>
	    {
		    setImmediate(() =>
		    {
			    utils.invokeCallback(callback);
		    });
	    });

		this.server.on('connection', socket =>
        {
	        const masterSocket = new MasterSocket();
	        masterSocket['agent'] = this;
	        masterSocket['socket'] = socket;
			this.sockets[socket.id] = socket;

			socket.on('register', msg =>
            {
	            // register a new connection
	            masterSocket.onRegister(msg);
			});

			socket.on('monitor', msg =>
            {
	            masterSocket.onMonitor(msg);
			});

			socket.on('client', msg =>
            {
	            masterSocket.onClient(msg);
			});

			socket.on('reconnect', (msg, pid) =>
            {
	            masterSocket.onReconnect(msg);
			});

			socket.on('disconnect', () =>
            {
	            masterSocket.onDisconnect();
			});

	        socket.on('close', () =>
	        {
		        masterSocket.onDisconnect();
	        });

			socket.on('error', error =>
            {
	            masterSocket.onError(error);
			});
		});
	}

    /**
     *  close master agent
     *
     * @returns
     *
     * @memberOf MasterAgent
     */
	close()
    {
		if (this.state > ST_STARTED)
        {
			return;
		}
		this.state = ST_CLOSED;
		this.server.close();
	}

    /**
     * set module
     *
     * @param {String} moduleId module id/name
     * @param {aObjectny} value module object
     *
     * @memberOf MasterAgent
     */
	set(moduleId, value)
    {
		this.consoleService.set(moduleId, value);
	}

    /**
     * get module
     *
     * @param {String} moduleId module id/name
     * @returns
     *
     * @memberOf MasterAgent
     */
	get(moduleId)
    {
		return this.consoleService.get(moduleId);
	}

    /**
     * getClient by Id
     *
     * @param {String} clientId
     * @returns
     *
     * @memberOf MasterAgent
     */
	getClientById(clientId)
    {
		return this.clients[clientId];
	}

    /**
     * request monitor{master node} data from monitor
     *
     * @param {String} serverId
     * @param {String} moduleId module id/name
     * @param {Object} msg
     * @param {Function} callback
     * @returns
     *
     * @memberOf MasterAgent
     */
	request(serverId, moduleId, msg, callback)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}

	    const curId = this.reqId++;
	    this.callbacks[curId] = callback;

	    if (!this.msgMap[serverId])
	    {
		    this.msgMap[serverId] = {};
	    }

	    this.msgMap[serverId][curId] = {
		    moduleId : moduleId,
		    msg      : msg
	    };

		const record = this.idMap[serverId];
		if (!record)
        {
			utils.invokeCallback(callback, new Error(`unknown server id:${serverId}`));
			return false;
		}

	    this.sendToMonitor(record.socket, curId, moduleId, msg);
	}

    /**
     * request server data from monitor by serverInfo{host:port}
     *
     * @param {String} serverId
     * @param {Object} serverInfo
     * @param {String} moduleId
     * @param {Object} msg
     * @param {Function} callback
     * @returns
     *
     * @memberOf MasterAgent
     */
	requestServer(serverId, serverInfo, moduleId, msg, callback)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			utils.invokeCallback(callback, new Error(`unknown server id:${serverId}`));
			return false;
		}

		const curId = this.reqId++;
		this.callbacks[curId] = callback;

		if (utils.compareServer(record, serverInfo))
        {
	        this.sendToMonitor(record.socket, curId, moduleId, msg);
		}
		else
        {
			const slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++)
            {
				if (utils.compareServer(slaves[i], serverInfo))
                {
	                this.sendToMonitor(slaves[i].socket, curId, moduleId, msg);
					break;
				}
			}
		}
	    return true;
	}

    /**
     * notify a monitor{master node} by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyById(serverId, moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			logger.error(`fail to notifyById for unknown server id:${serverId}`);
			return false;
		}
	    this.sendToMonitor(record.socket, null, moduleId, msg);
		return true;
	}

    /**
     *  notify a monitor by server{host:port} without callback
     *
     * @param {String} serverId
     * @param {Object} serverInfo
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyByServer(serverId, serverInfo, moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return  false;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			logger.error(`fail to notifyByServer for unknown server id:${serverId}`);
			return false;
		}

		if (utils.compareServer(record, serverInfo))
        {
	        this.sendToMonitor(record.socket, null, moduleId, msg);
		}
		else
        {
			const slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++)
            {
				if (utils.compareServer(slaves[i], serverInfo))
                {
					this.sendToMonitor(slaves[i].socket, null, moduleId, msg);
					break;
				}
			}
		}
		return true;
	}

    /**
     *  notify slaves by id without callback
     *
     * @param {String} serverId
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifySlavesById(serverId, moduleId, msg)
    {
		if (this.state > ST_STARTED)
		{
			return false;
		}

		const slaves = this.slaveMap[serverId];
		if (!slaves || slaves.length === 0)
		{
			logger.error(`fail to notifySlavesById for unknown server id:${serverId}`);
			return false;
		}

		MasterAgentUtility.BroadcastMonitors(slaves, moduleId, msg);
		return true;
	}

    /**
     * notify monitors by type without callback
     *
     * @param {String} type
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyByType(type, moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}

		const list = this.typeMap[type];
		if (!list || list.length === 0)
        {
			logger.error(`fail to notifyByType for unknown server type:${type}`);
			return false;
		}
		MasterAgentUtility.BroadcastMonitors(list, moduleId, msg);
		return true;
	}

    /**
     * notify all the monitors without callback
     *
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyAll(moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}
		MasterAgentUtility.BroadcastMonitors(this.idMap, moduleId, msg);
		return true;
	}

    /**
     * notify a client by id without callback
     *
     * @param {String} clientId
     * @param {String} moduleId
     * @param {Object} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyClient(clientId, moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}

		const record = this.clients[clientId];
		if (!record)
        {
			logger.error(`fail to notifyClient for unknown client id:${clientId}`);
			return false;
		}
		MasterAgentUtility.SendToClient(record.socket, null, moduleId, msg);
	    return true;
	}

    /**
     *
     *
     * @param {any} command
     * @param {any} moduleId
     * @param {any} msg
     * @returns
     *
     * @memberOf MasterAgent
     */
	notifyCommand(command, moduleId, msg)
    {
		if (this.state > ST_STARTED)
        {
			return false;
		}
		MasterAgentUtility.BroadcastCommand(this.idMap, command, moduleId, msg);
		return true;
	}

	/**
	 *
	 *
	 * @static
	 * @param {Object} msg
	 * @param {EventEmitter} socket
	 * @param {MasterAgent} agent
	 * @param {Function} callback
	 * @returns
	 *
	 * @memberOf MasterAgentUtility
	 */
	doAuthUser(msg, socket, callback)
	{
		if (!msg.id)
		{
			// client should has a client id
			callback(new Error('client should has a client id'));
			return;
		}

		const username = msg.username;
		if (!username)
		{
			// client should auth with username
			this.doSend(socket, 'register', {
				code : protocol.PRO_FAIL,
				msg  : 'client should auth with username'
			});
			callback(new Error('client should auth with username'));
			return;
		}

		const authUser = this.consoleService.authUser;
		const env = this.consoleService.env;
		authUser(msg, env, user =>
		{
			if (!user)
			{
				// client should auth with username
				this.doSend(socket, 'register', {
					code : protocol.PRO_FAIL,
					msg  : 'client auth failed with username or password error'
				});
				callback(new Error('client auth failed with username or password error'));
				return;
			}

			if (this.clients[msg.id])
			{
				this.doSend(socket, 'register', {
					code : protocol.PRO_FAIL,
					msg  : `id has been registered. id:${msg.id}`
				});
				callback(new Error(`id has been registered. id:${msg.id}`));
				return;
			}

			logger.info(`client user : ${username} login to master`);
			this.addConnection(this, msg.id, msg.type, null, user, socket);
			this.doSend(socket, 'register', {
				code : protocol.PRO_OK,
				msg  : 'ok'
			});
			callback(null);
		});
	}

	doAuthServer(msg, socket, callback)
	{
		const authServer = this.consoleService.authServer;
		const env = this.consoleService.env;
		authServer(msg, env, status =>
		{
			if (status !== 'ok')
			{
				this.doSend(socket, 'register', {
					code : protocol.PRO_FAIL,
					msg  : 'server auth failed'
				});
				callback(new Error('server auth failed'));
				return;
			}

			this.addConnection(this, msg.id, msg.serverType, msg.pid, msg.info, socket);

			this.doSend(socket, 'register', {
				code : protocol.PRO_OK,
				msg  : 'ok'
			});

			msg.info.pid = msg.pid || {};
			this.emit('register', msg.info);
			callback(null);
		});
	}

	addConnection(agent, id, type, pid, info, socket)
	{
		const record = {
			id     : id,
			type   : type,
			pid    : pid,
			info   : info,
			socket : socket
		};
		if (type === 'client')
		{
			agent.clients[id] = record;
		}
		else
		{
			if (!agent.idMap[id])
			{
				agent.idMap[id] = record;
				const list = agent.typeMap[type] = agent.typeMap[type] || [];
				list.push(record);
			}
			else
			{
				const slaves = agent.slaveMap[id] = agent.slaveMap[id] || [];
				slaves.push(record);
			}
		}
		return record;
	}

	removeConnection(agent, id, type, info)
	{
		if (type === 'client')
		{
			delete agent.clients[id];
		}
		else
		{
			// remove master node in idMap and typeMap
			const record = agent.idMap[id];
			if (!record)
			{
				return;
			}
			const _info = record['info'];
			if (utils.compareServer(_info, info))
			{
				delete agent.idMap[id];
				const list = agent.typeMap[type];
				if (list)
				{
					for (let i = 0, l = list.length; i < l; i++)
					{
						if (list[i].id === id)
						{
							list.splice(i, 1);
							break;
						}
					}
					if (list.length === 0)
					{
						delete agent.typeMap[type];
					}
				}
			}
			else
			{
				// remove slave node in slaveMap
				const slaves = agent.slaveMap[id];
				if (slaves)
				{
					for (let i = 0, l = slaves.length; i < l; i++)
					{
						if (utils.compareServer(slaves[i]['info'], info))
						{
							slaves.splice(i, 1);
							break;
						}
					}
					if (slaves.length === 0)
					{
						delete agent.slaveMap[id];
					}
				}
			}
		}
	}

	sendToMonitor(socket, reqId, moduleId, msg)
	{
		this.doSend(socket, 'monitor', protocol.composeRequest(reqId, moduleId, msg));
	}
}

/**
 *
 *
 * @class MasterAgentUtility
 */
class MasterAgentUtility
{

    /**
     *
     *
     * @static
     * @param {any} obj
     *
     * @memberOf MasterAgentUtility
     */
	static IpFilter(obj)
    {
		if (typeof this.whitelist === 'function')
        {
			this.whitelist((err, tmpList) =>
            {
				if (err)
                {
					logger.error('%j.(pomelo-admin whitelist).', err);
					return;
				}
				if (!Array.isArray(tmpList))
                {
					logger.error('%j is not an array.(pomelo-admin whitelist).', tmpList);
					return;
				}
				if (obj && obj.ip && obj.id)
                {
					for (const i in tmpList)
                    {
						const exp = new RegExp(tmpList[i]);
						if (exp.test(obj.ip))
                        {
							return;
						}
					}
					const sock = this.sockets[obj.id];
					if (sock)
                    {
						sock.disconnect('unauthorized');
						logger.error('%s is rejected(pomelo-admin whitelist).', obj.ip);
					}
				}
			});
		}
	}

    /**
     *
     *
     * @static
     * @param {*} socket
     * @param {any} reqId
     * @param {any} moduleId
     * @param {any} msg
     *
     * @memberOf MasterAgentUtility
     */
	static SendToClient(socket, reqId, moduleId, msg)
    {
	    MasterAgentUtility.DoSend(socket, 'client', protocol.composeRequest(reqId, moduleId, msg));
	}

	static DoSend(socket, topic, msg)
	{
		socket.send(topic, msg);
	}

    /**
     *
     *
     * @static
     * @param {*} records
     * @param {String} moduleId
     * @param {Object} msg
     *
     * @memberOf MasterAgentUtility
     */
	static BroadcastMonitors(records, moduleId, msg)
    {
		msg = protocol.composeRequest(null, moduleId, msg);
		_.forEach(records, record =>
        {
	        MasterAgentUtility.DoSend(record.socket, 'monitor', msg);
		});
	}

    /**
     *
     *
     * @static
     * @param {*} records
     * @param {any} command
     * @param {any} moduleId
     * @param {any} msg
     *
     * @memberOf MasterAgentUtility
     */
	static BroadcastCommand(records, command, moduleId, msg)
    {
	    msg = protocol.composeCommand(null, command, moduleId, msg);
		_.forEach(records, record =>
        {
	        MasterAgentUtility.DoSend(record.socket, 'monitor', msg);
		});
	}
}

MasterAgent.prototype.doSend = MasterAgentUtility.DoSend;

module.exports = MasterAgent;