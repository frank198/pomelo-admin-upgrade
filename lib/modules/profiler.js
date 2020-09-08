'use strict';
const utils = require('../util/utils'),
    ProfileProxy = require('../util/profileProxy'),
    fs = require('fs'),
    path = require('path');
let profiler = null;
try
{
    profiler = require('v8-profiler-node8');
}
catch (e)
{

}

class Profiler
{
    constructor(opts)
    {
        if (opts && opts.isMaster)
        {
            this.proxy = new ProfileProxy();
        }
    }

    monitorHandler(agent, msg, callback)
    {
        if (!profiler)
        {
            return;
        }
        const type = msg.type,
                action = msg.action,
                uid = msg.uid;
        if (type === 'CPU')
        {
            if (action === 'start')
            {
                profiler.startProfiling();
            }
            else
            {
                const result = profiler.stopProfiling();
                const res = {};
                res.head = result.getTopDownRoot();
                res.bottomUpHead = result.getBottomUpRoot();
                res.msg = msg;
                agent.notify(module.exports.moduleId, {
                    clientId : msg.clientId,
                    type     : type,
                    body     : res});
            }
        }
        else
        {
            const snapshot = profiler.takeSnapshot();
            const appBase = path.dirname(require.main.filename);
            const name = `${appBase}/logs/${utils.format(new Date())}.log`;
            const log = fs.createWriteStream(name, {'flags': 'a'});
            snapshot.serialize({
                onData : function(chunk, size)
                {
                    chunk = `${chunk}`;
                    const data = {
                        method : 'Profiler.addHeapSnapshotChunk',
                        params : {
                            uid   : uid,
                            chunk : chunk
                        }
                    };
                    log.write(chunk);
                    agent.notify(module.exports.moduleId, {
                        clientId : msg.clientId,
                        type     : type,
                        body     : data});
                },
                onEnd : function()
                {
                    agent.notify(module.exports.moduleId, {
                        clientId : msg.clientId,
                        type     : type,
                        body     : {params: {uid: uid}}});
                    profiler.deleteAllSnapshots();
                }
            });
        }
    }

    masterHandler(agent, msg, callback)
    {
        if (msg.type === 'CPU')
        {
            this.proxy.stopCallBack(msg.body, msg.clientId, agent);
        }
        else
        {
            this.proxy.takeSnapCallBack(msg.body);
        }
    }

    clientHandler(agent, msg, callback)
    {
        if (msg.action === 'list')
        {

            const idMap = agent.idMap || {};
            const servers = Object.keys(idMap);
            callback(null, servers);
            return;
        }

        if (typeof msg === 'string')
        {
            msg = JSON.parse(msg);
        }
        const id = msg.id;
        const command = msg.method.split('.');
        const method = command[1];
        const params = msg.params;
        const clientId = msg.clientId;

        if (!this.proxy[method] || typeof this.proxy[method] !== 'function')
        {
            return;
        }

        this.proxy[method](id, params, clientId, agent);
    }
}

module.exports = function(opts)
{
    return new Profiler(opts);
};

if (!profiler)
{
    module.exports.moduleError = 1;
}

module.exports.moduleId = 'profiler';