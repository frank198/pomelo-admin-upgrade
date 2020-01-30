'use strict';
const protocol = require('../util/protocol'),
    utils = require('../util/utils'),
    MqttClient = require('../protocol/mqtt/mqttClient');

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
        this.username = opt['username'] || '';
        this.password = opt['password'] || '';
        this.md5 = opt['md5'] || false;
    }

    connect(id, host, port, callback)
    {
        this.id = id;
        console.log(`try to connect ${host}:${port}`);
        this.socket = new MqttClient({id: id});

	    this.socket.connect(host, port);

        this.socket.on('connect', () =>
        {
            this.state = Client.ST_CONNECTED;
            if (this.md5)
            {
                this.password = utils.md5(this.password);
            }
	        this.doSend('register', {
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
                if (cb && typeof cb === 'function')
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
	    this.doSend('client', req);
    }

    notify(moduleId, msg)
    {
        // something dirty: attach current client id into msg
        msg = msg || {};
        msg.clientId = this.id;
        msg.username = this.username;
        const req = protocol.composeRequest(null, moduleId, msg);
	    this.doSend('client', req);
    }

    command(command, moduleId, msg, callback)
    {
        const id = this.reqId++;
        msg = msg || {};
        msg.clientId = this.id;
        msg.username = this.username;
        const commandReq = protocol.composeCommand(id, command, moduleId, msg);
        this.callbacks[id] = callback;
	    this.doSend('client', commandReq);
        // this.socket.emit('client', commandReq);
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
        let listener, i, l;
        for (i = 0, l = listeners.length; i < l; i++) {
            listener = listeners[i];
            if (listener && typeof listener === 'function') {
                listener(...arguments);
            }
        }
    }

    doSend(topic, msg)
    {
        this.socket.send(topic, msg);
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