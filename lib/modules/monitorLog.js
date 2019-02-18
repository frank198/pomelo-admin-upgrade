'use strict';
const path = require('path'),
        exec = require('child_process').exec,
        logger = require('pomelo-logger-upgrade').getLogger('pomelo_admin', __filename);

const DEFAULT_INTERVAL = 5 * 60;		// in second
class MonitorLog
{
    constructor(opts)
    {
        opts = opts || {};
        this.root = opts.path;
        this.interval = opts.interval || DEFAULT_INTERVAL;
    }

    monitorHandler(agent, msg, callback)
    {
        if (!msg.logfile)
        {
            callback(new Error('logfile should not be empty'));
            return;
        }
        fetchLogs(this.root, msg, function(data)
        {
            callback(null, {
                serverId : agent.id,
                body     : data});
        });
    }

    clientHandler(agent, msg, callback)
    {
        agent.request(msg.serverId, module.exports.moduleId, msg, function(err, res)
        {
            if (err)
            {
                logger.error(`fail to run log for ${err.stack}`);
                return;
            }
            callback(null, res);
        });
    }
}

const fetchLogs = function(root, msg, callback)
{
    const number = msg.number;
    const logfile = msg.logfile;
    const serverId = msg.serverId;
    const filePath = path.join(root, `${logfile}-${serverId}.log`);

    const endLogs = [];
    exec(`tail -n ${number} ${filePath}`, (error, output) =>
    {
        logger.error(error);
        const endOut = [];
        output = output.replace(/^\s+|\s+$/g, '').split(/\s+/);

        for (let i = 5; i < output.length; i += 6)
        {
            endOut.push(output[i]);
        }

        const endLength = endOut.length;
        for (let j = 0; j < endLength; j++)
        {
            const map = {};
            let json;
            try
            {
                json = JSON.parse(endOut[j]);
            }
            catch (e)
            {
                logger.error(`the log cannot parsed to json, ${e}`);
                continue;
            }
            map.time = json.time;
            map.route = json.route || json.service;
            map.serverId = serverId;
            map.timeUsed = json.timeUsed;
            map.params = endOut[j];
            endLogs.push(map);
        }

        callback({
            logfile   : logfile,
            dataArray : endLogs});
    });
};

module.exports = function(opts)
{
    return new MonitorLog(opts);
};

module.exports.moduleId = 'monitorLog';