'use strict';
const net = require('net'),
    MqttCon = require('mqtt-connection'),
    EventEmitter = require('events').EventEmitter,
    logger = require('pomelo-logger-upgrade').getLogger('pomelo_admin_upgrade', 'MqttServer');

let curId = 1;

class MqttServer extends EventEmitter
{
    constructor(opts, cb)
    {
        super();
        this.inited = false;
        this.closed = true;
        this.cb = cb || function() {};
    }

    listen(port)
    {
        // check status
        if (this.inited)
        {
            this.cb(new Error('already inited.'));
            return;
        }

        this.inited = true;

        this.server = new net.Server();
        this.server.listen(port);

        logger.info('[MqttServer] listen on %d', port);

        this.server.on('listening', this.emit.bind(this, 'listening'));

        this.server.on('error', err =>
        {
            // logger.error('mqtt server is error: %j', err.stack);
            this.emit('error', err);
        });

        this.server.on('connection', stream =>
        {
            const client = MqttCon(stream);
            client['id'] = curId++;

            client.on('connect', pkg =>
            {
                client.connack({returnCode: 0});
            });

            client.on('publish', pkg =>
            {
                const topic = pkg.topic;
                let msg = pkg.payload.toString();
                msg = JSON.parse(msg);

                // logger.debug('[MqttServer] publish %s %j', topic, msg);
                client.emit(topic, msg);
            });

            client.on('pingreq', () =>
            {
                client.pingresp();
            });

            client.send = (topic, msg) =>
            {
                client.publish({
                    topic   : topic,
                    payload : JSON.stringify(msg)
                });
            };
            // timeout idle streams after 5 minutes
            stream.setTimeout(1000 * 60 * 5);

            // connection error handling
            client.on('close', () => {client.destroy();});
            client.on('error', () =>{client.destroy();});
            client.on('disconnect', () => {client.destroy();});
            // stream timeout
            stream.on('timeout', () => {client.destroy();});

            this.emit('connection', client);
        });
    }

    send(topic, msg)
    {
        this.socket.publish({
            topic   : topic,
            payload : msg
        });
    }

    close()
    {
        if (this.closed)
        {
            return;
        }

        this.closed = true;
        this.server.close();
        this.emit('closed');
    }
}

module.exports = MqttServer;