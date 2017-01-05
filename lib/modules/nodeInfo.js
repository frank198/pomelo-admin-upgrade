const monitor = require('pomelo-monitor');

const DEFAULT_INTERVAL = 5 * 60;		// in second
const DEFAULT_DELAY = 10;						// in second

class NodeInfo
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
		const serverId = agent.id;
		const pid = process.pid;
		const params = {
			serverId : serverId,
			pid      : pid
		};
		monitor.psmonitor.getPsInfo(params, (info, data) =>
        {
			agent.notify(module.exports.moduleId, {
				serverId : agent.id,
				body     : data});
		});
	}

	masterHandler(agent, msg, callback)
    {
		if (!msg)
        {
			agent.notifyAll(module.exports.moduleId);
			return;
		}

		const body = msg.body;
		let data = agent.get(module.exports.moduleId);
		if (!data)
        {
			data = {};
			agent.set(module.exports.moduleId, data);
		}

		data[msg.serverId] = body;
	}

	clientHandler(agent, msg, callback)
    {
		callback(null, agent.get(module.exports.moduleId) || {});
	}
}

module.exports = function(opts)
{
	return new NodeInfo(opts);
};

module.exports.moduleId = 'nodeInfo';