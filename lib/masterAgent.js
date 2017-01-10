const EventEmitter = require('events').EventEmitter,
	sio = require('socket.io'),
	utils = require('./util/utils'),
	_ = require('lodash'),
	protocol = require('./util/protocol'),
	logger = require('pomelo-logger').getLogger('pomelo-admin', __filename);

const ST_INITED = 1;
const ST_STARTED = 2;
const ST_CLOSED = 3;
const TYPE_CLIENT = 'client';
const TYPE_MONITOR = 'monitor';

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
		this.consoleService = consoleService;
		this.server = null;
		this.idMap = {};
		this.typeMap = {};
		this.slaveMap = {};
		this.clients = {};
		this.reqId = 1;
		this.callbacks = {};
		this.sockets = {};
		this.whitelist = opts.whitelist || {};
		this.state = ST_INITED;
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
		this.server = sio.listen(port);

		this.server.httpServer.on('error', err =>
        {
			this.emit('error', err);
			utils.invokeCallback(callback, err);
		});

	    this.server.httpServer.once('listening', () =>
	    {
		    setImmediate(() =>
		    {
			    utils.invokeCallback(callback);
		    });
	    });

		this.server.on('connection', socket =>
        {
			let type, id, info, registered, username;
			this.sockets[socket.id] = socket;
			this.emit('connection',
				{
					id : socket.id,
					ip : socket.handshake.address.address
				});

			socket.on('register', msg =>
            {
				if (msg && msg.type)
                {
					switch (msg.type)
                    {
					case TYPE_CLIENT:
						{
							type = msg.type;
							id = msg.id;
							info = 'client';
							MasterAgentUtility.DoAuthUser(msg, socket, this, err =>
                            {
								if (err)
                                {
									socket.disconnect();
									return;
								}
								username = msg.username;
								registered = true;
							});
						}
						break;
					case TYPE_MONITOR:
						{
							if (msg.id)
                            {
								type = msg.serverType;
								id = msg.id;
								info = msg.info;
								MasterAgentUtility.DoAuthServer(msg, socket, this, err =>
                                {
									if (err)
                                    {
										socket.disconnect();
										return;
									}
									registered = true;
								});
							}
						}
						break;
					default:
						{
							socket.emit('register', {
								code : protocol.PRO_FAIL,
								msg  : 'unknown auth master type'
							});
							socket.disconnect();
						}
					}
				}
			});

			socket.on('monitor', msg =>
            {
				if (!registered)
                {
                    // not register yet, ignore any message
                    // kick connections
					socket.disconnect();
					return;
				}

				if (type === TYPE_CLIENT)
                {
					logger.error('invalid message to monitor, but current connect type is client.');
					return;
				}

				msg = protocol.parse(msg);
				if (msg.respId)
                {
					const callback = this.callbacks[msg.respId];
					if (!callback)
                    {
						logger.warn(`unknown respId: ${msg.respId}`);
						return;
					}
					delete this.callbacks[msg.respId];
					utils.invokeCallback(callback, msg.error, msg.body);
					return;
				}

                // a request or a notify from monitor
				this.consoleService.execute(msg.moduleId, 'masterHandler', msg.body, (err, res) =>
                {
					if (protocol.isRequest(msg))
                    {
						const resp = protocol.composeResponse(msg, err, res);
						if (resp)
                        {
							socket.emit('monitor', resp);
						}
					}
					else
                    {
                        // notify should not have a callback
						logger.warn('notify should not have a callback.');
					}
				});

			});

			socket.on('client', msg =>
            {
				if (registered)
                {
                    // not register yet, ignore any message
                    // kick connections
					socket.disconnect();
					return;
				}

				if (type !== TYPE_CLIENT)
                {
					logger.error(`invalid message to client, but current connect type is ${type}.`);
					return;
				}

				msg = protocol.parse(msg);
				if (msg.command)
                {
                    // 接收到客户端的命令
					this.consoleService.command(msg.command, msg.moduleId, msg.body, (err, res) =>
                    {
						if (protocol.isRequest(msg))
                        {
							const resp = protocol.composeResponse(msg, err, res);
							if (resp)
                            {
								socket.emit('client', resp);
							}
						}
						else
                        {
                            // notify should not have a callback
							logger.warn('notify should not have a callback.');
						}
					});
				}
				else
                {
                    // a request or a notify from client
                    // and client should not have any response to master for master would not request anything from client
					this.consoleService.execute(msg.moduleId, 'clientHandler', msg.body, (err, res) =>
                    {
						if (protocol.isRequest(msg))
                        {
							const resp = protocol.composeResponse(msg, err, res);
							if (resp)
                            {
								socket.emit('client', resp);
							}
						}
						else
                        {
                            // notify should not have a callback
							logger.warn('notify should not have a callback.');
						}
					});
				}
			});

			socket.on('reconnect', (msg, pid) =>
            {
				if (msg && msg.type)
                {
					if (msg.id)
                    {
						if (this.idMap[msg.id])
                        {
							socket.emit('reconnect_ok', {
								code : protocol.PRO_FAIL,
								msg  : `id has been registered. id: ${msg.id}`
							});
							return;
						}

						MasterAgentUtility.AddConnection(this, msg.id, msg.serverType, msg.pid, msg.info, socket);
						id = msg.id;
						type = msg.serverType;
						registered = true;
						msg.info.pid = pid;
						info = msg.info;
						socket.emit('reconnect_ok', {
							code : protocol.PRO_OK,
							msg  : 'ok'
						});
						this.emit('reconnect', msg.info);
					}
				}
			});

			socket.on('disconnect', () =>
            {
				delete this.sockets[socket.id];
				if (registered)
                {
					MasterAgentUtility.RemoveConnection(this, id, type, info);
					this.emit('disconnect', id, type, info);
					if (type === TYPE_CLIENT)
                    {
						logger.info(`client user ${username} exit`);
					}
				}
				registered = false;
				id = null;
				type = null;
			});

			socket.on('error', error =>
            {
				this.emit('error', error);
			});
		});

		this.on('connection', MasterAgentUtility.IpFilter.bind(this));
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
			return;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			utils.invokeCallback(callback, new Error(`unknown server id:${serverId}`));
			return;
		}
		const curId = this.reqId++;
		this.callbacks[curId] = callback;
		MasterAgentUtility.SendToMonitor(record.socket, curId, moduleId, msg);
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
			return;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			utils.invokeCallback(callback, new Error(`unknown server id:${serverId}`));
			return;
		}

		const curId = this.reqId++;
		this.callbacks[curId] = callback;

		if (utils.compareServer(record, serverInfo))
        {
			MasterAgentUtility.SendToMonitor(record.socket, curId, moduleId, msg);
		}
		else
        {
			const slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++)
            {
				if (utils.compareServer(slaves[i], serverInfo))
                {
					MasterAgentUtility.SendToMonitor(slaves[i].socket, curId, moduleId, msg);
					break;
				}
			}
		}
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
			return;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			logger.error(`fail to notifyById for unknown server id:${serverId}`);
			return false;
		}
		MasterAgentUtility.SendToMonitor(record.socket, null, moduleId, msg);
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
			return;
		}

		const record = this.idMap[serverId];
		if (!record)
        {
			logger.error(`fail to notifyByServer for unknown server id:${serverId}`);
			return false;
		}

		if (utils.compareServer(record, serverInfo))
        {
			MasterAgentUtility.SendToMonitor(record.socket, null, moduleId, msg);
		}
		else
        {
			const slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++)
            {
				if (utils.compareServer(slaves[i], serverInfo))
                {
					MasterAgentUtility.SendToMonitor(slaves[i].socket, null, moduleId, msg);
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
			return;
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
			return;
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
			return;
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
			return;
		}

		const record = this.clients[clientId];
		if (!record)
        {
			logger.error(`fail to notifyClient for unknown client id:${clientId}`);
			return false;
		}
		MasterAgentUtility.SendToClient(record.socket, null, moduleId, msg);
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
			return;
		}
		MasterAgentUtility.BroadcastCommand(this.idMap, command, moduleId, msg);
		return true;
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
     * @param {Object} msg
     * @param {EventEmitter} socket
     * @param {MasterAgent} agent
     * @param {Function} callback
     * @returns
     *
     * @memberOf MasterAgentUtility
     */
	static DoAuthUser(msg, socket, agent, callback)
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
			socket.emit('register', {
				code : protocol.PRO_FAIL,
				msg  : 'client should auth with username'
			});
			callback(new Error('client should auth with username'));
			return;
		}

		const authUser = agent.consoleService.authUser;
		const env = agent.consoleService.env;
		authUser(msg, env, user =>
        {
			if (!user)
            {
                // client should auth with username
				socket.emit('register', {
					code : protocol.PRO_FAIL,
					msg  : 'client auth failed with username or password error'
				});
				callback(new Error('client auth failed with username or password error'));
				return;
			}

			if (agent.clients[msg.id])
            {
				socket.emit('register', {
					code : protocol.PRO_FAIL,
					msg  : `id has been registered. id:${msg.id}`
				});
				callback(new Error(`id has been registered. id:${msg.id}`));
				return;
			}

			logger.info(`client user : ${username} login to master`);
			MasterAgentUtility.AddConnection(agent, msg.id, msg.type, null, user, socket);
			socket.emit('register', {
				code : protocol.PRO_OK,
				msg  : 'ok'
			});
			callback(null);
		});
	}

    /**
     *
     *
     * @static
     * @param {Object} msg
     * @param {EventEmitter} socket
     * @param {MasterAgent} agent
     * @param {Function} callback
     *
     * @memberOf MasterAgentUtility
     */
	static DoAuthServer(msg, socket, agent, callback)
    {
		const authServer = agent.consoleService.authServer;
		const env = agent.consoleService.env;
		authServer(msg, env, status =>
        {
			if (status !== 'ok')
            {
				socket.emit('register', {
					code : protocol.PRO_FAIL,
					msg  : 'server auth failed'
				});
				callback(new Error('server auth failed'));
				return;
			}

			MasterAgentUtility.AddConnection(agent, msg.id, msg.serverType, msg.pid, msg.info, socket);

			socket.emit('register', {
				code : protocol.PRO_OK,
				msg  : 'ok'
			});
			msg.info.pid = msg.pid;
			agent.emit('register', msg.info);
			callback(null);
		});
	}

    /**
     *
     *
     * @static
     * @param {MasterAgent} agent
     * @param {String} id
     * @param {String} type
     * @param {String} pid
     * @param {any} info
     * @param {any} socket
     * @returns
     *
     * @memberOf MasterAgentUtility
     */
	static AddConnection(agent, id, type, pid, info, socket)
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

    /**
     *
     *
     * @static
     * @param {MasterAgent} agent
     * @param {any} id
     * @param {String} type
     * @param {any} info
     * @returns
     *
     * @memberOf MasterAgentUtility
     */
	static RemoveConnection(agent, id, type, info)
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
     * @param {EventEmitter} socket
     * @param {any} reqId
     * @param {any} moduleId
     * @param {any} msg
     *
     * @memberOf MasterAgentUtility
     */
	static SendToMonitor(socket, reqId, moduleId, msg)
    {
		socket.emit('monitor', protocol.composeRequest(reqId, moduleId, msg));
	}

    /**
     *
     *
     * @static
     * @param {EventEmitter} socket
     * @param {any} reqId
     * @param {any} moduleId
     * @param {any} msg
     *
     * @memberOf MasterAgentUtility
     */
	static SendToClient(socket, reqId, moduleId, msg)
    {
		socket.emit('client', protocol.composeRequest(reqId, moduleId, msg));
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
			record.socket.emit('monitor', msg);
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
		msg = protocol.composeCommand(null, moduleId, msg);
		_.forEach(records, record =>
        {
			record.socket.emit('monitor', msg);
		});
	}
}

module.exports = MasterAgent;