'use strict';
const systemMonitor = require('../monitor/systemMonitor');

const DEFAULT_INTERVAL = 5 * 60;		// in second
const DEFAULT_DELAY = 10;

class SystemInfo
{
    constructor(opts)
    {
        opts = opts || {};
        this.type = opts.type || 'pull';
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.delay = opts.delay || DEFAULT_DELAY;
    }

    monitorHandler(agent, msg, callback)
    {
        // collect data
        const sysInfo = systemMonitor.getSysInfo();
        if (sysInfo)
        {
            agent.notify(module.exports.moduleId, {
                serverId : agent.id,
                body     : sysInfo});
        }
    }

    masterHandler(agent, msg, callback)
    {
        if (!msg)
        {
            agent.notifyAll(module.exports.moduleId);
            return;
        }

        const body = msg.body;

        const oneData = {
            Time          : body.iostat.date,
            hostname      : body.hostname,
            serverId      : msg.serverId,
            'cpu_user'    : body.iostat.cpu.cpu_user,
            'cpu_nice'    : body.iostat.cpu.cpu_nice,
            'cpu_system'  : body.iostat.cpu.cpu_system,
            'cpu_iowait'  : body.iostat.cpu.cpu_iowait,
            'cpu_steal'   : body.iostat.cpu.cpu_steal,
            'cpu_idle'    : body.iostat.cpu.cpu_idle,
            tps           : body.iostat.disk.tps,
            'kb_read'     : body.iostat.disk.kb_read,
            'kb_wrtn'     : body.iostat.disk.kb_wrtn,
            'kb_read_per' : body.iostat.disk.kb_read_per,
            'kb_wrtn_per' : body.iostat.disk.kb_wrtn_per,
            totalmem      : body.totalmem,
            freemem       : body.freemem,
            'free/total'  : (body.freemem / body.totalmem),
            'm_1'         : body.loadavg[0],
            'm_5'         : body.loadavg[1],
            'm_15'        : body.loadavg[2]
        };

        let data = agent.get(module.exports.moduleId);
        if (!data)
        {
            data = {};
            agent.set(module.exports.moduleId, data);
        }

        data[msg.serverId] = oneData;
    }

    clientHandler(agent, msg, callback)
    {
        callback(null, agent.get(module.exports.moduleId) || {});
    }
}

module.exports = function(opts)
{
    return new SystemInfo(opts);
};

module.exports.moduleId = 'systemInfo';