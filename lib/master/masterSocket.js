'use strict';
const logger = require('pomelo-logger-upgrade').getLogger('pomelo_admin', 'MasterSocket'),
        Constants = require('../util/constants'),
        utils = require('../util/utils'),
        protocol = require('../util/protocol');

class MasterSocket
{
    constructor()
    {
        this.id = null;
        this.type = null;
        this.info = null;
        this.agent = null;
        this.socket = null;
        this.username = null;
        this.registered = false;
    }

    onRegister(msg)
    {
        if (!msg || !msg.type)
        {
            return;
        }

        const serverId = msg.id;
        const serverType = msg.type;
        const socket = this.socket;

        switch (msg.type)
        {
            case Constants.TYPE_CLIENT:
                {
                    this.id = serverId;
                    this.type = serverType;
                    this.info = 'client';
                    this.agent.doAuthUser(msg, socket, err =>
                    {
                        if (err)
                        {
                            socket.disconnect();
                            return;
                        }
                        this.username = msg.username;
                        this.registered = true;
                    });
                }
                break;
            case Constants.TYPE_MONITOR:
                {
                    if (!serverId)
                    {
                        return;
                    }
                    // if is a normal server
                    this.id = serverId;
                    this.type = msg.serverType;
                    this.info = msg.info;
                    this.agent.doAuthServer(msg, socket, err =>
                    {
                        if (err)
                        {
                            return socket.disconnect();
                        }

                        this.registered = true;
                    });

                    this.repushQosMessage(serverId);
                }
                break;
            default:
            {
                this.agent.doSend(socket, 'register', {
                    code : protocol.PRO_FAIL,
                    msg  : 'unknown auth master type'
                });

                socket.disconnect();
            }
        }
    }

    onMonitor(msg)
    {
        const socket = this.socket;
        if (!this.registered)
        {
            // not register yet, ignore any message
            // kick connections
            socket.disconnect();
            return;
        }

        if (this.type === Constants.TYPE_CLIENT)
        {
            logger.error('invalid message to monitor, but current connect type is client.');
            return;
        }

        msg = protocol.parse(msg);
        const respId = msg.respId;
        if (respId)
        {
            const callback = this.agent.callbacks[respId];
            if (!callback)
            {
                logger.warn(`unknown respId: ${respId}`);
                return;
            }
            const id = this.id;
            if (this.agent.msgMap[id])
            {
                delete this.agent.msgMap[id][respId];
            }
            delete this.agent.callbacks[respId];
            utils.invokeCallback(callback, msg.error, msg.body);
            return;
        }

        // a request or a notify from monitor
        this.agent.consoleService.execute(msg.moduleId, 'masterHandler', msg.body, (err, res) =>
        {
            if (protocol.isRequest(msg))
            {
                const resp = protocol.composeResponse(msg, err, res);
                if (resp)
                {
                    this.agent.doSend(socket, 'monitor', resp);
                }
            }
            else
            {
                // notify should not have a callback
                logger.warn('notify should not have a callback.');
            }
        });
    }

    onClient(msg)
    {
        const socket = this.socket;
        if (!this.registered)
        {
            // not register yet, ignore any message
            // kick connections
            return socket.disconnect();
        }

        const type = this.type;
        if (type !== Constants.TYPE_CLIENT)
        {
            logger.error(`invalid message to client, but current connect type is ${type}`);
            return;
        }

        msg = protocol.parse(msg);

        const msgCommand = msg.command;
        const msgModuleId = msg.moduleId;
        const msgBody = msg.body;

        if (msgCommand)
        {
            // a command from client
            this.agent.consoleService.command(msgCommand, msgModuleId, msgBody, (err, res) =>
            {
                if (protocol.isRequest(msg))
                {
                    const resp = protocol.composeResponse(msg, err, res);
                    if (resp)
                    {
                        this.agent.doSend(socket, 'client', resp);
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
            this.agent.consoleService.execute(msgModuleId, 'clientHandler', msgBody, (err, res) =>
            {
                if (protocol.isRequest(msg))
                {
                    const resp = protocol.composeResponse(msg, err, res);
                    if (resp)
                    {
                        this.agent.doSend(socket, 'client', resp);
                    }
                }
                else
                {
                    // notify should not have a callback
                    logger.warn('notify should not have a callback.');
                }
            });
        }
    }

    onReconnect(msg, pid)
    {
        // reconnect a new connection
        if (!msg || !msg.type)
        {
            return;
        }

        const serverId = msg.id;
        if (!serverId)
        {
            return;
        }

        const socket = this.socket;

        // if is a normal server
        if (this.agent.idMap[serverId])
        {
            // id has been registered
            this.agent.doSend(socket, 'reconnect_ok', {
                code : protocol.PRO_FAIL,
                msg  : `id has been registered. id:${serverId}`
            });
            return;
        }

        const msgServerType = msg.serverType;
        const record = this.agent.addConnection(this.agent, serverId, msgServerType, msg.pid, msg.info, socket);

        this.id = serverId;
        this.type = msgServerType;
        this.registered = true;
        msg.info.pid = pid;
        this.info = msg.info;
        this.agent.doSend(socket, 'reconnect_ok', {
            code : protocol.PRO_OK,
            msg  : 'ok'
        });

        this.agent.emit('reconnect', msg.info);

        this.repushQosMessage(serverId);
    }

    onDisconnect()
    {
        const socket = this.socket;
        if (socket)
        {
            delete this.agent.sockets[socket.id];
        }

        const registered = this.registered;
        if (!registered)
        {
            return;
        }

        const id = this.id;
        const type = this.type;
        const info = this.info;
        const username = this.username;

        logger.debug('disconnect %s %s %j', id, type, info);
        if (registered)
        {
            this.agent.removeConnection(this.agent, id, type, info);
            this.agent.emit('disconnect', id, type, info);
        }

        if (type === Constants.TYPE_CLIENT && registered)
        {
            logger.info(`client user ${username} exit`);
        }

        this.registered = false;
        this.id = null;
        this.type = null;
    }

    repushQosMessage(serverId)
    {
        const socket = this.socket;
        // repush qos message
        const qosMsgs = this.agent.msgMap[serverId];

        if (!qosMsgs)
        {
            return;
        }

        logger.debug('repush qos message %j', qosMsgs);

        for (const reqId in qosMsgs)
        {
            const qosMsg = qosMsgs[reqId];
            const moduleId = qosMsg['moduleId'];
            const tmsg = qosMsg['msg'];

            this.agent.sendToMonitor(socket, reqId, moduleId, tmsg);
        }
    }

    onError(err)
    {
        logger.error('server %s error %s', this.id, err.stack);
        // this.onDisconnect();
    }
}

module.exports = function()
{
    if (!(this instanceof MasterSocket))
    {
        return new MasterSocket();
    }
};