'use strict';
/**
 *Module dependencies
 */

const execSync = require('child_process').execSync,
        FormatTime = require('../util/utils').FormatTime;

/**
 * get the process information by command 'ps auxw | grep serverId | grep pid'
 *
 * @param {Object} param
 * @api public
 */
module.exports.getPsInfo = (param) =>
{
    if (process.platform === 'windows') return;
    const pid = param.pid;
    const cmd = `ps auxw | grep ${pid} | grep -v 'grep'`;
    // var cmd = "ps auxw | grep -E '.+?\\s+" + pid + "\\s+'"  ;
    try
    {
        const output = execSync(cmd);
        return format(param, output);
    }
    catch (e)
    {
        throw new Error(e);
    }
};

/**
 * convert serverInfo to required format, and the callback will handle the serverInfo
 *
 * @param {Object} param, contains serverId etc
 * @param {String} data, the output if the command 'ps'
 * @api private
 */
const format = (param, data) =>
{
    const time = FormatTime(new Date());
    let outArray = data.toString().replace(/^\s+|\s+$/g, '')
        .split(/\s+/);
    let outValueArray = [];
    for (let i = 0; i < outArray.length; i++)
    {
        if ((!isNaN(outArray[i])))
        {
            outValueArray.push(outArray[i]);
        }
    }
    const ps = {};
    ps.time = time;
    ps.serverId = param.serverId;
    ps.serverType = ps.serverId.split('-')[0];
    const pid = ps.pid = param.pid;
    ps.cpuAvg = outValueArray[1];
    ps.memAvg = outValueArray[2];
    ps.vsz = outValueArray[3];
    ps.rss = outValueArray[4];
    if (process.platform === 'darwin')
    {
        ps.usr = 0;
        ps.sys = 0;
        ps.gue = 0;
        return ps;
    }
    let output = null;
    try
    {
        output = execSync(`pidstat -p ${pid}`);
    }
    catch (e)
    {
        throw new Error(e);
    }
    outValueArray = [];
    outArray = output.toString().replace(/^\s+|\s+$/g, '')
        .split(/\s+/);
    for (let i = 0; i < outArray.length; i++)
    {
        if ((!isNaN(outArray[i])))
        {
            outValueArray.push(outArray[i]);
        }
    }
    ps.usr = outValueArray[1];
    ps.sys = outValueArray[2];
    ps.gue = outValueArray[3];
    return ps;
};

