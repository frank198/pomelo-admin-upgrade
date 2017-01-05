const _ = require('lodash'),
	io = require('socket.io-client'),
	protocol = require('../util/protocol'),
	utils = require('../util/utils');

class Client
{
	constructor(opt)
    {
		opt = opt || {};
		this.id = '';
		this.reqId = 1;
		this.callbacks = {};
		this.listeners = {};
		this.state = Client.ST_INITED;
		this.socket = null;
		this.username = _.get(opt, 'username', '');
		this.password = _.get(opt, 'password', '');
		this.md5 = _.get(opt, 'md5', false);
	}

	connect(id, host, port, callback)
    {
		this.id = id;
		console.log(`try to connect ${host}:${port}`);
		this.socket = io.connect(`http://{host}:${port}`, {
			'force new connection' : true,
			'reconnect'            : false
		});

		this.socket.on('connect', () =>
        {
			this.state = Client.ST_CONNECTED;
			if (this.md5)
            {
				this.password = utils.md5(this.password);
			}
			this.socket.emit('register', {
				type     : 'client',
				id       : id,
				username : this.username,
				password : this.password,
				md5      : this.md5
			});
		});

		this.socket.on('register', res =>
        {
			if (res.code !== protocol.PRO_OK)
            {
				callback(res.msg);
				return;
			}

			this.state = Client.ST_REGISTERED;
			callback();
		});

		this.socket.on('client', msg =>
        {
			msg = protocol.parse(msg);
			if (msg.respId)
            {
				// response for request
				const cb = this.callbacks[msg.respId];
				delete this.callbacks[msg.respId];
				if (_.isFunction(cb))
                {
					cb(msg.error, msg.body);
				}
			}
			else if (msg.moduleId)
            {
				// notify
				this.emit(msg.moduleId, msg);
			}
		});

		this.socket.on('error', err =>
        {
			if (this.state < Client.ST_CONNECTED)
            {
				callback(err);
			}

			this.emit('error', err);
		});

		this.socket.on('disconnect', reason =>
        {
			this.state = Client.ST_CLOSED;
			this.emit('close');
		});
	}

	request(moduleId, msg, callback)
    {
		const id = this.reqId++;
		// something dirty: attach current client id into msg
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		const req = protocol.composeRequest(id, moduleId, msg);
		this.callbacks[id] = callback;
		this.socket.emit('client', req);
	}

	notify(moduleId, msg)
    {
        // something dirty: attach current client id into msg
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		const req = protocol.composeRequest(null, moduleId, msg);
		this.socket.emit('client', req);
	}

	command(command, moduleId, msg, callback)
    {
		const id = this.reqId++;
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		const commandReq = protocol.composeCommand(id, command, moduleId, msg);
		this.callbacks[id] = callback;
		this.socket.emit('client', commandReq);
	}

	on(event, listener)
    {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(listener);
	}

	emit(event, ...args)
    {
		const listeners = this.listeners[event];
		if (!listeners || !listeners.length)
        {
			return;
		}

		_.forEach(listeners, listener =>
        {
			if (_.isFunction(listener))
            {
				listener(...args);
			}
		});
	}
}

Client.ST_INITED = 1;
Client.ST_CONNECTED = 2;
Client.ST_REGISTERED = 3;
Client.ST_CLOSED = 4;

module.exports = function(opt)
{
	if (!(this instanceof Client))
    {
		return new Client(opt);
	}
};