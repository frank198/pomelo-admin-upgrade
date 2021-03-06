'use strict';
const net = require('net'),
        utils = require('../../util/utils'),
        MqttCon = require('mqtt-connection'),
        constants = require('../../util/constants'),
        EventEmitter = require('events').EventEmitter,
        logger = require('pomelo-logger-upgrade').getLogger('pomelo_admin_upgrade', 'MqttClient');

class MqttClient extends EventEmitter
{
    constructor(opts)
    {
        super();
        this.clientId = `MQTT_ADMIN_${Date.now()}`;
        this.id = opts.id;
        this.requests = {};
        this.connectedTimes = 1;
        this.host = null;
        this.port = null;
        this.socket = null;
        this.lastPing = -1;
        this.lastPong = -1;
        this.closed = false;
        this.timeoutId = null;
        this.connected = false;
        this.reconnectId = null;
        this.timeoutFlag = false;
        this.keepaliveTimer = null;
        this.reconnectDelay = 0;
        this.reconnectDelayMax = opts.reconnectDelayMax || constants.DEFAULT_PARAM.RECONNECT_DELAY_MAX;
        this.timeout = opts.timeout || constants.DEFAULT_PARAM.TIMEOUT;
        this.keepalive = opts.keepalive || constants.DEFAULT_PARAM.KEEPALIVE;
    }

    connect(host, port, callback)
    {
        if (this.connected)
        {
            utils.invokeCallback(callback, new Error('MqttClient has already connected.'));
            return;
        }

        if (host)
        {
            this.host = host;
        }
        else
        {
            host = this.host;
        }

        if (port)
        {
            this.port = port;
        }
        else
        {
            port = this.port;
        }

        this.closed = false;

        const stream = net.createConnection(this.port, this.host);
        this.socket = MqttCon(stream);

        // logger.info('try to connect %s %s', this.host, this.port);
        this.socket.connect({
            clientId : this.clientId
        });

        this.addTimeout();

        this.socket.on('connack', () =>
        {
            if (this.connected)
            {
                return;
            }

            this.connected = true;

            this.setupKeepAlive();

            if (this.connectedTimes++ == 1)
            {
                this.emit('connect');
                utils.invokeCallback(callback, null);
            }
            else
            {
                this.emit('reconnect');
            }
        });

        this.socket.on('publish', pkg =>
        {
            const topic = pkg.topic;
            let msg = pkg.payload.toString();
            msg = JSON.parse(msg);

            // logger.debug('[MqttClient] publish %s %j', topic, msg);
            this.emit(topic, msg);
        });

        this.socket.on('close', () =>
        {
            logger.error('mqtt socket is close, remote server host: %s, port: %s', host, port);
            this.onSocketClose();
        });

        this.socket.on('error', err =>
        {
            logger.error('mqtt socket is error, remote server host: %s, port: %s', host, port, err.stack);
            // this.emit('error', new Error('[MqttClient] socket is error, remote server ' + host + ':' + port));
            this.onSocketClose();
        });

        this.socket.on('pingresp', () =>
        {
            this.lastPong = process.uptime();
        });

        this.socket.on('disconnect', () =>
        {
            logger.error('mqtt socket is disconnect, remote server host: %s, port: %s', host, port);
            this.emit('disconnect', this.id);
            this.onSocketClose();
        });

        this.socket.on('timeout', reconnectFlag =>
        {
            if (reconnectFlag)
            {
                this.reconnect();
            }
            else
            {
                this.exit();
            }
        });
    }

    send(topic, msg)
    {
        // console.log('MqttClient send %s %j ~~~', topic, msg);
        this.socket.publish({
            topic   : topic,
            payload : JSON.stringify(msg)
        });
    }

    onSocketClose()
    {
        // console.log('onSocketClose ' + this.closed);
        if (this.closed)
        {
            return;
        }

        clearInterval(this.keepaliveTimer);
        clearTimeout(this.timeoutId);
        this.keepaliveTimer = null;
        this.lastPing = -1;
        this.lastPong = -1;
        this.connected = false;
        this.closed = true;
        delete this.socket;
        this.socket = null;

        if (this.connectedTimes > 1)
        {
            this.reconnect();
        }
        else
        {
            this.exit();
        }
    }

    addTimeout(reconnectFlag)
    {
        if (this.timeoutFlag)
        {
            return;
        }

        this.timeoutFlag = true;

        this.timeoutId = setTimeout(() =>
        {
            this.timeoutFlag = false;
            logger.error('mqtt client connect %s:%d timeout %d s', this.host, this.port, this.timeout / 1000);
            this.socket.emit('timeout', reconnectFlag);
        }, this.timeout);
    }

    reconnect()
    {
        let delay = this.reconnectDelay * 2 || constants.DEFAULT_PARAM.RECONNECT_DELAY;
        if (delay > this.reconnectDelayMax)
        {
            delay = this.reconnectDelayMax;
        }

        this.reconnectDelay = delay;

        // logger.debug('[MqttClient] reconnect %d ...', delay);
        this.reconnectId = setTimeout(() =>
        {
            logger.info('reconnect delay %d s', delay / 1000);
            this.addTimeout(true);
            this.connect();
        }, delay);
    }

    setupKeepAlive()
    {
        clearTimeout(this.reconnectId);
        clearTimeout(this.timeoutId);

        this.keepaliveTimer = setInterval(() =>
        {
            this.checkKeepAlive();
        }, this.keepalive);
    }

    checkKeepAlive()
    {
        if (this.closed)
        {
            return;
        }

        const now = process.uptime();
        const KEEP_ALIVE_TIMEOUT = this.keepalive * 2;
        if (this.lastPing > 0)
        {
            if (this.lastPong < this.lastPing)
            {
                if (now - this.lastPing > KEEP_ALIVE_TIMEOUT)
                {
                    logger.error('mqtt rpc client checkKeepAlive error timeout for %d', KEEP_ALIVE_TIMEOUT);
                    this.close();
                }
            }
            else
            {
                this.socket.pingreq();
                this.lastPing = process.uptime();
            }
        }
        else
        {
            this.socket.pingreq();
            this.lastPing = process.uptime();
        }
    }

    disconnect()
    {
        this.close();
    }

    close()
    {
        this.connected = false;
        this.closed = true;
        this.socket.disconnect();
    }

    exit()
    {
        logger.info('exit ...');
        process.exit(0);
    }
}

module.exports = function(opts)
{
    if (!(this instanceof MqttClient))
    {
        return new MqttClient(opts);
    }
};