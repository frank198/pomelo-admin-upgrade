const EventEmitter = require('events').EventEmitter,
	protocol = require('./util/protocol'),
	utils = require('./util/utils'),
	sclient = require('socket.io-client'),
	_ = require('lodash'),
	logger = require('pomelo-logger').getLogger('pomelo-admin', __filename);

const ST_INITED = 1;
const ST_CONNECTED = 2;
const ST_REGISTERED = 3;
const ST_CLOSED = 4;
const STATUS_INTERVAL = 5 * 1000; // 60 seconds

class MonitorAgent extends EventEmitter
{
	constructor(opts)
    {
		super();
		this.consoleService = opts.consoleService;
		this.id = opts.id;
		this.type = opts.type;
		this.info = opts.info;
		this.socket = null;
		this.reqId = 1;
		this.callbacks = {};
		this.state = ST_INITED;
	}
    
	/**
	 *
	 * register and connect to master server
	 * @param {String} port
	 * @param {String} host
	 * @param {Function} callback
	 * @returns
	 *
	 * @memberOf MonitorAgent
	 */
	connect(port, host, callback)
    {
		if (this.state > ST_INITED)
        {
			logger.error('monitor client has connected or closed.');
			return;
		}

		this.socket = sclient.connect(`${host}:${port}`, {
			'force new connection'      : true,
			'reconnect'                 : true,
			'max reconnection attempts' : 20});

		this.socket.on('redister', msg =>
        {
			if (msg && msg.code === protocol.PRO_OK)
            {
				this.state = ST_REGISTERED;
				utils.invokeCallback(callback);
			}
			else
            {
				this.emit('close');
				logger.error(`server [${this.id}] [${this.type}] register master failed`);
			}
		});

		this.socket.on('monitor', msg =>
        {
			if (this.state !== ST_REGISTERED)
            {
				return;
			}
			msg = protocol.parse(msg);

			if (msg.command)
            {
				this.consoleService.command(msg.command, msg.moduleId, msg.body, (error, res) =>
                {
                     // notify should not have a callback
					 logger.error(`msg command error [${error}]`);
				});
			}
			else
            {
				if (msg.respId)
                {
					const cb = this.callbacks[msg.respId];
					if (!cb)
                    {
						return;
					}
					delete this.callbacks[msg.respId];
					utils.invokeCallback(cb, msg.error, msg.body);
					return;
				}

				this.consoleService.execute(msg.moduleId, 'monitorHandler', msg.body, (err, res) =>
				{
					if (protocol.isRequest(msg))
					{
						const resp = protocol.composeResponse(msg, err, res);
						if (resp)
						{
							this.socket.emit('monitor', resp);
						}
					}
					else
					{
						// notify should not have a callback
						logger.error('notify should not have a callback.');
					}
				});
			}
		});

		this.socket.on('connect', () =>
		{
			if (this.state > ST_INITED)
			{
				return;
			}
			this.state = ST_CONNECTED;
			const req =
				{
					id         : this.id,
					type       : 'monitor',
					serverType : this.type,
					pid        : process.pid,
					info       : this.info
				};

			const authServer = this.consoleService.authServer;
			const env = this.consoleService.env;
			if (_.isFunction(authServer))
			{
				authServer(req, env, (token) =>
				{
					req['token'] = token;
					this.socket.emit('register', req);
				});
			}
		});

		this.socket.on('error', err =>
		{
			if (this.state < ST_CONNECTED)
			{
				utils.invokeCallback(callback, err);
			}
			else
			{
				this.emit('error', err);
			}
		});

		this.socket.on('disconnect', reason =>
		{
			this.state = ST_CLOSED;
			this.emit('close');
		});

		this.socket.on('reconnect', () =>
		{
			this.state = ST_CONNECTED;
			const req =
				{
					id         : this.id,
					type       : 'monitor',
					serverType : this.type,
					pid        : process.pid,
					info       : this.info
				};
			this.socket.emit('reconnect', req, process.pid);
		});

		this.socket.on('reconnect_ok', msg =>
		{
			if (msg && msg.code === protocol.PRO_OK)
			{
				this.state = ST_REGISTERED;
			}
		});
	}
	
	/**
	 *
	 * close monitor agent
	 * @returns
	 *
	 * @memberOf MonitorAgent
	 */
	close()
	{
		if (this.state >= ST_CLOSED)
		{
			return;
		}
		this.state = ST_CLOSED;
		this.socket.disconnect();
	}

	/**
	 * set module
	 *
	 * @param {String} moduleId module id/name
	 * @param {Object} value module object
	 *
	 * @memberOf MonitorAgent
	 */
	set(moduleId, value)
	{
		this.consoleService.set(moduleId, value);
	}

	get(moduleId)
	{
		return this.consoleService.get(moduleId);
	}

	/**
	 * notify master server without callback
	 *
	 * @param {String} moduleId
	 * @param {Object} msg
	 * @returns
	 *
	 * @memberOf MonitorAgent
	 */
	notify(moduleId, msg)
	{
		if (this.state !== ST_REGISTERED)
		{
			logger.error(`agent can not notify now, state: ${this.state}`);
			return;
		}
		this.socket.emit('monitor', protocol.composeRequest(null, moduleId, msg));
	}

	/**
	 * request master server
	 *
	 * @param {String} moduleId
	 * @param {Object} msg
	 * @param {Function} callback
	 * @returns
	 *
	 * @memberOf MonitorAgent
	 */
	request(moduleId, msg, callback)
	{
		if (this.state !== ST_REGISTERED)
		{
			logger.error(`agent can not notify now, state: ${this.state}`);
			return;
		}
		const reqId = this.reqId++;
		this.callbacks[reqId] = callback;
		this.socket.emit('monitor', protocol.composeRequest(reqId, moduleId, msg));
	}
}

module.exports = function(opts)
{
	if (!(this instanceof MonitorAgent))
	{
		return new MonitorAgent(opts);
	}
};