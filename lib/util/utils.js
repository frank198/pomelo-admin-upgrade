/**
 * Created by frank on 16-12-26.
 */
const _ = require('lodash'),
	crypto = require('crypto'),
	path = require('path'),
	fs = require('fs');

class Utils
{
	/**
	 *  Invoke callback with check
	 * @param {Function} callback
	 * @param args
	 */
	static invokeCallback(callback, ...args)
	{
		if (_.isFunction(callback))
		{
			// callback.apply(null, Array.prototype.slice.call(arguments, 1));
			const arg = Array.from ? Array.from(args) : [].slice.call(args);
			// action.apply(null, args);
			callback(...arg);
		}
	}

	/**
	 *  Get the count of elements of object
	 * @param obj
	 */
	static size(obj)
	{
		let count = 0;
		_.forEach(obj, (objData, index) =>
		{
			if (obj.hasOwnProperty(index) && !_.isFunction(objData))
			{
				count ++;
			}
		});
		return count;
	}

	static compareServer(server1, server2)
	{
		return (server1['host'] === server2['host']) &&
        (server1['port'] === server2['port']);
	}

	static md5(str)
	{
		const md5sum = crypto.createHash('md5');
		md5sum.update(str);
		str = md5sum.digest('hex');
		return str;
	}
	
	static defaultAuthUser(msg, env, callback)
	{
		let adminUser = null;
		const appBase = path.dirname(require.main.filename);
		const adminUserPath = path.join(appBase, '/config/adminUser.json');
		const presentPath = path.join(appBase, 'config', env, 'adminUser.json');
		if (fs.existsSync(adminUserPath))
        {
			adminUser = require(adminUserPath);
		}
		else if (fs.existsSync(presentPath))
        {
			adminUser = require(presentPath);
		}
		else
        {
			callback(null);
			return;
		}
		const username = msg['username'];
		const password = msg['password'];
		const md5 = msg['md5'];

		const len = adminUser.length;
		if (md5)
        {
			for (let i = 0; i < len; i++)
            {
				const user = adminUser[i];
				if (user['username'] === username)
                {
					const p = Utils.md5(user['password']);
					if (password === p)
                    {
						callback(user);
						return;
					}
				}
			}
		}
		else
        {
			for (let i = 0; i < len; i++)
            {
				const user = adminUser[i];
				if (user['username'] === username && user['password'] === password)
                {
					callback(user);
					return;
				}
			}
		}
		callback(null);
	}

	/*
	 * Date format
	 */
	static format(date, format)
	{
		format = format || 'MM-dd-hhmm';
		const month = 3;
		const o = {
			'M+' : date.getMonth() + 1, // month
			'd+' : date.getDate(), // day
			'h+' : date.getHours(), // hour
			'm+' : date.getMinutes(), // minute
			's+' : date.getSeconds(), // second
			'q+' : Math.floor((date.getMonth() + month) / month), // quarter
			'S'  : date.getMilliseconds() // millisecond
		};

		if (/(y+)/.test(format))
		{
			format = format.replace(RegExp.$1, (`${date.getFullYear()}`).substr(4 - RegExp.$1.length));
		}

		_.forEach(o, (time, sign) =>
		{
			if (new RegExp(`(${sign})`).test(format))
			{
				format = format.replace(RegExp.$1, RegExp.$1.length === 1 ? time :
					(`00${time}`).substr((`${time}`).length));
			}
		});

		return format;
	}
	
	static defaultAuthServerMaster(msg, env, callback)
	{
		const type = msg['serverType'];
		const token = msg['token'];
		if (type === 'master')
        {
			callback('ok');
			return;
		}

		let servers = null;
		const appBase = path.dirname(require.main.filename);
		const serverPath = path.join(appBase, '/config/adminServer.json');
		const presentPath = path.join(appBase, 'config', env, 'adminServer.json');
		if (fs.existsSync(serverPath))
        {
			servers = require(serverPath);
		}
		else if (fs.existsSync(presentPath))
        {
			servers = require(presentPath);
		}
		else
        {
			callback('ok');
			return;
		}

		const len = servers.length;
		for (let i = 0; i < len; i++)
        {
			const server = servers[i];
			if (server['type'] === type && server['token'] === token)
            {
				callback('ok');
				return;
			}
		}
		callback('bad');
	}

	/**
	 * transform unicode to utf8
	 */
	static defaultAuthServerMonitor(msg, env, callback)
	{
		const type = msg['serverType'];

		let servers = null;
		const appBase = path.dirname(require.main.filename);
		const serverPath = path.join(appBase, '/config/adminServer.json');
		const presentPath = path.join(appBase, 'config', env, 'adminServer.json');
		if (fs.existsSync(serverPath))
        {
			servers = require(serverPath);
		}
		else if (fs.existsSync(presentPath))
        {
			servers = require(presentPath);
		}
		else
        {
			callback('ok');
			return;
		}

		const len = servers.length;
		for (let i = 0; i < len; i++)
        {
			const server = servers[i];
			if (server['type'] === type)
            {
				callback(server['token']);
				return;
			}
		}
		callback(null);
	}
	
}

module.exports = Utils;